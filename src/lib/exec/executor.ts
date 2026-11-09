// Executor: turns an APPROVED intent into exactly one effect on PayPal, surviving kill -9 at any point.
//   claim (lease) -> if a previous attempt died: RECONCILE against PayPal -> re-gate on a fresh snapshot ->
//   send with a stable PayPal-Request-Id and [ref] tag -> confirm (only if we still hold the lease).
// Never retries blind: attempt > 1 always reconciles first (CLAUDE.md Pillar 2).
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { gate } from "../firewall/gate";
import { ProposedAction, type Policy, type Snapshot } from "../firewall/types";
import { PayPalError } from "../paypal/client";
import { LinkAbsentError } from "../paypal/disputes";
import { claimNext, type Db } from "./intents";

export type Reconciled = { visible: boolean; how: string };
export type Effects = {
  /** Fresh firewall snapshot. Must exclude `intentId` itself from `executed`/pending sums. */
  snapshot(a: ProposedAction, intentId: number): Promise<Snapshot>;
  /** Is this intent's effect already on PayPal? `visible: false` with how="idempotency-key" means "re-send with the same key". */
  reconcile(a: ProposedAction, ref: string): Promise<Reconciled>;
  send(a: ProposedAction, ref: string, requestId: string): Promise<{ paypalRef: string | null }>;
};
export type FaultPoint = "crash_after_send" | "crash_before_confirm";

export type StepResult =
  | { kind: "idle" }
  | { kind: "confirmed"; intentId: number; via: "send" | "reconcile" }
  | { kind: "denied"; intentId: number; reason: string }
  | { kind: "failed"; intentId: number; error: string }
  | { kind: "retry_later"; intentId: number; error: string }
  | { kind: "lease_lost"; intentId: number }
  | { kind: "needs_approval"; intentId: number; rule: string };

/** Short, stable tag derived from the idempotency key; it goes into PayPal notes/messages so reconcile can find it. */
export const refFor = (idempotencyKey: string) => createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 12);

export async function executeNext(
  db: Db,
  owner: string,
  fx: Effects,
  o: { policy: Policy; now: () => number; leaseMs: number; maxAttempts: number; retryAfterMs: number; fault?: (p: FaultPoint) => void },
): Promise<StepResult> {
  const c = await claimNext(db, owner, o.leaseMs);
  if (!c) return { kind: "idle" };
  const action = ProposedAction.parse(c.params);
  const ref = refFor(c.idempotencyKey);
  const requestId = `rebuttal-${ref}`; // same on every attempt
  const log = (kind: string, data: object) => db.execute(sql`insert into event_log (dispute_id, kind, data) values (${c.disputeId}, ${kind}, ${JSON.stringify({ intentId: c.id, attempt: c.attempt, ...data })}::jsonb)`);

  try {
    if (c.attempt > 1) {
      const r = await fx.reconcile(action, ref);
      await log("reconcile", { ...r });
      if (r.visible) return finish(db, c.id, owner, "CONFIRMED", { via: "reconcile", how: r.how }, () => ({ kind: "confirmed", intentId: c.id, via: "reconcile" }));
    }
    if (c.attempt > o.maxAttempts) return finish(db, c.id, owner, "FAILED", { error: "max attempts" }, () => ({ kind: "failed", intentId: c.id, error: "max attempts" }));

    // Every rule is re-checked against PayPal's state right now. Only a human's answer satisfies REQUIRE_APPROVAL
    // (never a DENY): an action that was auto-ALLOWed but now needs approval goes back to the seller.
    const decision = gate(action, await fx.snapshot(action, c.id), o.policy, o.now(), { approved: c.humanApproved });
    if (decision.kind === "REQUIRE_APPROVAL") return parkForApproval(db, c.id, owner, decision.rule);
    if (decision.kind === "DENY") {
      await log("regate_deny", { decision });
      return finish(db, c.id, owner, "FAILED", { error: decision.reason }, () => ({ kind: "denied", intentId: c.id, reason: decision.reason }));
    }
    if (!(await stillOwner(db, c.id, owner))) return { kind: "lease_lost", intentId: c.id };

    const sent = await fx.send(action, ref, requestId);
    o.fault?.("crash_after_send");
    await log("sent", { paypalRef: sent.paypalRef, ref });
    o.fault?.("crash_before_confirm");
    return finish(db, c.id, owner, "CONFIRMED", { via: "send", paypalRef: sent.paypalRef }, () => ({ kind: "confirmed", intentId: c.id, via: "send" }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // A definite refusal from PayPal (4xx) or a missing link will not fix itself: fail. Anything else (timeout,
    // 5xx, network) is an UNKNOWN outcome: keep SENDING; the next attempt reconciles before doing anything.
    const definite = e instanceof LinkAbsentError || (e instanceof PayPalError && e.res.status >= 400 && e.res.status < 500 && e.res.status !== 429);
    if (definite) return finish(db, c.id, owner, "FAILED", { error: msg }, () => ({ kind: "failed", intentId: c.id, error: msg }));
    await db.execute(sql`update action_intent set last_error = ${msg.slice(0, 500)}, lease_expires_at = now() + ${o.retryAfterMs} * interval '1 millisecond', updated_at = now()
      where id = ${c.id} and lease_owner = ${owner}`);
    await log("unknown_outcome", { error: msg.slice(0, 200) });
    return { kind: "retry_later", intentId: c.id, error: msg };
  }
}

async function stillOwner(db: Db, id: number, owner: string): Promise<boolean> {
  const r = await db.execute(sql`select 1 from action_intent where id = ${id} and status = 'SENDING' and lease_owner = ${owner} and lease_expires_at > now()`);
  return (r as unknown as { rows: unknown[] }).rows.length > 0;
}

/** Terminal state, outbox done and log row in one transaction, fenced on the lease so a stale worker cannot overwrite. */
/** Back to PROPOSED for the seller. Safe even after a crash: we only get here once reconcile found no effect. */
async function parkForApproval(db: Db, id: number, owner: string, rule: string): Promise<StepResult> {
  const parked = await db.transaction(async (tx) => {
    const r = await tx.execute(sql`update action_intent set status = 'PROPOSED', lease_owner = null, lease_expires_at = null, updated_at = now()
      where id = ${id} and status = 'SENDING' and lease_owner = ${owner} returning dispute_id`);
    const row = (r as unknown as { rows: { dispute_id: string }[] }).rows[0];
    if (!row) return false;
    await tx.execute(sql`update outbox set processed_at = now() where intent_id = ${id} and processed_at is null`);
    await tx.execute(sql`insert into event_log (dispute_id, kind, data) values (${row.dispute_id}, 'needs_approval', ${JSON.stringify({ intentId: id, rule })}::jsonb)`);
    return true;
  });
  return parked ? { kind: "needs_approval", intentId: id, rule } : { kind: "lease_lost", intentId: id };
}

async function finish(db: Db, id: number, owner: string, status: "CONFIRMED" | "FAILED", data: object, ok: () => StepResult): Promise<StepResult> {
  const updated = await db.transaction(async (tx) => {
    const r = await tx.execute(sql`update action_intent set status = ${status}, lease_owner = null, lease_expires_at = null, updated_at = now(),
      last_error = ${"error" in data ? String((data as { error: unknown }).error).slice(0, 500) : null}
      where id = ${id} and status = 'SENDING' and lease_owner = ${owner} returning dispute_id`);
    const row = (r as unknown as { rows: { dispute_id: string }[] }).rows[0];
    if (!row) return false;
    await tx.execute(sql`update outbox set processed_at = now() where intent_id = ${id} and processed_at is null`);
    await tx.execute(sql`insert into event_log (dispute_id, kind, data) values (${row.dispute_id}, ${status === "CONFIRMED" ? "confirmed" : "failed"}, ${JSON.stringify({ intentId: id, ...data })}::jsonb)`);
    return true;
  });
  return updated ? ok() : { kind: "lease_lost", intentId: id };
}
