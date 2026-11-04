// Executor state machine on real migrations (PGlite). PayPal is an in-memory fake that records effects by ref.
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dispute } from "../db/schema";
import { DEFAULT_POLICY, type ProposedAction, type Snapshot } from "../firewall/types";
import { PayPalError } from "../paypal/client";
import { executeNext, refFor, type Effects } from "./executor";
import { claimNext, recordDecision, type Db } from "./intents";

let db: Db;
const D = "PP-R-EXEC-1";
const msg: ProposedAction = { type: "SendMessage", disputeId: D, templateId: "EVIDENCE_SUBMITTED", slots: {} };
const refund: ProposedAction = { type: "IssueRefund", disputeId: D, amountCents: 100, currency: "USD" };
const allow = { kind: "ALLOW" as const, fired: [] };
const opts = { policy: DEFAULT_POLICY, now: () => Date.UTC(2026, 10, 4), leaseMs: 60_000, maxAttempts: 5, retryAfterMs: 0 };

beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  await d.insert(dispute).values({ id: D, reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", amountCents: 1000, currency: "USD", raw: {} });
  db = d as unknown as Db;
});

/** Fake PayPal. `effects` counts real effects per ref; `idempotent` models PayPal-Request-Id replay. */
function fakePaypal(over: Partial<{ links: string[]; sendError: () => Error | null; idempotent: boolean }> = {}) {
  const effects = new Map<string, number>();
  const seenRequestIds = new Set<string>();
  let sends = 0;
  const fx: Effects = {
    async snapshot(): Promise<Snapshot> {
      return {
        dispute: { id: D, status: "WAITING_FOR_SELLER_RESPONSE", links: over.links ?? ["self", "send_message"], sellerResponseDueMs: Date.UTC(2026, 10, 20), amountCents: 1000, currency: "USD", orderId: "CAP" },
        capture: { amountCents: 1000, currency: "USD" }, refundedCents: 0, pendingRefundCents: 0, refundsTodayCents: 0, refundsToBuyer30dCents: 0,
        buyerDisputes60d: 1, executed: new Set(), evidenceStore: new Map(), exhibitBytesSha256: new Map(),
      };
    },
    async reconcile(a, ref) {
      if (a.type === "IssueRefund") return { visible: false, how: "idempotency-key" };
      return { visible: (effects.get(ref) ?? 0) > 0, how: "fake state" };
    },
    async send(_a, ref, requestId) {
      sends++;
      if (!(over.idempotent && seenRequestIds.has(requestId))) effects.set(ref, (effects.get(ref) ?? 0) + 1); // the effect lands...
      seenRequestIds.add(requestId);
      const err = over.sendError?.();
      if (err) throw err; // ...but the caller may never hear about it
      return { paypalRef: `PAY-${ref}` };
    },
  };
  return { fx, effects, sends: () => sends };
}

const status = async () => ((await db.execute(sql`select status, attempt from action_intent`)) as unknown as { rows: { status: string; attempt: number }[] }).rows[0];
const expireLeases = () => db.execute(sql`update action_intent set lease_expires_at = now() - interval '1 second' where status = 'SENDING'`);
const logKinds = async () => ((await db.execute(sql`select kind from event_log order by id`)) as unknown as { rows: { kind: string }[] }).rows.map((r) => r.kind);

describe("executor", () => {
  it("happy path: one send, CONFIRMED, outbox drained", async () => {
    const p = fakePaypal();
    const id = (await recordDecision(db, msg, allow))!;
    expect(await executeNext(db, "w1", p.fx, opts)).toEqual({ kind: "confirmed", intentId: id, via: "send" });
    expect(await status()).toEqual({ status: "CONFIRMED", attempt: 1 });
    expect([...p.effects.values()]).toEqual([1]);
    expect(await executeNext(db, "w1", p.fx, opts)).toEqual({ kind: "idle" });
  });

  it("effect landed but the response was lost: next attempt reconciles and does NOT send again", async () => {
    let first = true;
    const p = fakePaypal({ sendError: () => (first ? ((first = false), new Error("socket hang up")) : null) });
    await recordDecision(db, msg, allow);
    expect((await executeNext(db, "w1", p.fx, opts)).kind).toBe("retry_later");
    await expireLeases();
    expect(await executeNext(db, "w2", p.fx, opts)).toMatchObject({ kind: "confirmed", via: "reconcile" });
    expect(p.sends()).toBe(1);
    expect([...p.effects.values()]).toEqual([1]);
    expect(await logKinds()).toContain("reconcile");
  });

  it("worker died after claiming, before sending: reconcile finds nothing, sends once", async () => {
    const p = fakePaypal();
    await recordDecision(db, msg, allow);
    await claimNext(db, "dead-worker", 60_000); // claimed, then kill -9
    await expireLeases();
    expect(await executeNext(db, "w2", p.fx, opts)).toMatchObject({ kind: "confirmed", via: "send" });
    expect(await status()).toEqual({ status: "CONFIRMED", attempt: 2 });
    expect([...p.effects.values()]).toEqual([1]);
  });

  it("refunds: the retry re-sends with the SAME PayPal-Request-Id, so an idempotent PayPal makes one refund", async () => {
    let first = true;
    const p = fakePaypal({ idempotent: true, links: ["self"], sendError: () => (first ? ((first = false), new Error("timeout")) : null) });
    await recordDecision(db, refund, allow);
    expect((await executeNext(db, "w1", p.fx, opts)).kind).toBe("retry_later");
    await expireLeases();
    expect(await executeNext(db, "w2", p.fx, opts)).toMatchObject({ kind: "confirmed", via: "send" });
    expect(p.sends()).toBe(2);
    expect([...p.effects.values()]).toEqual([1]);
  });

  it("re-gates on fresh state: a link that disappeared since approval -> DENY, nothing sent", async () => {
    const p = fakePaypal({ links: ["self"] });
    await recordDecision(db, msg, allow);
    expect(await executeNext(db, "w1", p.fx, opts)).toMatchObject({ kind: "denied", reason: "I2_NO_LINK" });
    expect(p.sends()).toBe(0);
    expect((await status())!.status).toBe("FAILED");
  });

  it("a definite 4xx refusal fails the intent instead of retrying", async () => {
    const p = fakePaypal({ sendError: () => new PayPalError({ status: 422, ok: false, debugId: "x", body: { name: "UNPROCESSABLE_ENTITY" } }, "send") });
    await recordDecision(db, msg, allow);
    expect((await executeNext(db, "w1", p.fx, opts)).kind).toBe("failed");
    await expireLeases();
    expect(await executeNext(db, "w2", p.fx, opts)).toEqual({ kind: "idle" });
  });

  it("a stale worker whose lease was taken over cannot overwrite the outcome", async () => {
    await recordDecision(db, msg, allow);
    await claimNext(db, "slow", 60_000);
    await expireLeases();
    const p = fakePaypal();
    expect((await executeNext(db, "fast", p.fx, opts)).kind).toBe("confirmed");
    // "slow" wakes up and tries to finish: fenced on lease_owner, so nothing changes.
    const r = await db.execute(sql`update action_intent set status = 'FAILED' where status = 'SENDING' and lease_owner = 'slow' returning id`);
    expect((r as unknown as { rows: unknown[] }).rows).toHaveLength(0);
    expect((await status())!.status).toBe("CONFIRMED");
  });

  it("gives up after maxAttempts unknown outcomes (a human looks at it)", async () => {
    const p = fakePaypal({ idempotent: true, links: ["self"], sendError: () => new Error("still timing out") });
    await recordDecision(db, refund, allow);
    for (let i = 0; i < 5; i++) { expect((await executeNext(db, `w${i}`, p.fx, opts)).kind).toBe("retry_later"); await expireLeases(); }
    expect((await executeNext(db, "w9", p.fx, opts)).kind).toBe("failed");
    expect([...p.effects.values()]).toEqual([1]); // five sends, one refund: same key every time
  });

  it("ref is stable per idempotency key", () => {
    expect(refFor("a|b|c")).toBe(refFor("a|b|c"));
    expect(refFor("a|b|c")).not.toBe(refFor("a|b|d"));
  });
});
