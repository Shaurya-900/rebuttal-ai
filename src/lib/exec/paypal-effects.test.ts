// localState runs real SQL against the real migrations (PGlite). The chaos run found a query here that only
// failed on a real database, so it is tested directly.
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { dispute, exhibit } from "../db/schema";
import { actionKey } from "../firewall/gate";
import type { ProposedAction } from "../firewall/types";
import { PaypalDispute } from "../paypal/disputes";
import { recordDecision, type Db } from "./intents";
import { localState, reconcileFromDispute } from "./paypal-effects";

let db: Db;
const allow = { kind: "ALLOW" as const, fired: [] };
beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  for (const [id, buyer] of [["D1", "B1"], ["D2", "B1"], ["D3", "B2"]]) {
    await d.insert(dispute).values({ id: id!, captureId: `CAP-${id}`, buyerPayerId: buyer, reason: "X", status: "WAITING_FOR_SELLER_RESPONSE", amountCents: 1000, currency: "USD", raw: {} });
  }
  db = d as unknown as Db;
});

describe("localState", () => {
  it("sums money by status, excludes the intent being executed, counts buyer disputes", async () => {
    const r1: ProposedAction = { type: "IssueRefund", disputeId: "D1", amountCents: 300, currency: "USD" };
    const r2: ProposedAction = { type: "IssueRefund", disputeId: "D1", amountCents: 200, currency: "USD" };
    const r3: ProposedAction = { type: "IssueRefund", disputeId: "D2", amountCents: 50, currency: "USD" };
    const msg: ProposedAction = { type: "SendMessage", disputeId: "D1", templateId: "EVIDENCE_SUBMITTED", slots: {} };
    const [i1, i2, i3] = [await recordDecision(db, r1, allow), await recordDecision(db, r2, allow), await recordDecision(db, r3, allow)];
    await recordDecision(db, msg, allow);
    await db.execute(sql`update action_intent set status = 'CONFIRMED' where id = ${i1}`);
    await db.execute(sql`update action_intent set status = 'SENDING' where id in (${i2}, ${i3})`);

    const s = await localState(db, "D1", i2!);
    expect(s).toMatchObject({ captureId: "CAP-D1", refundedCents: 300, pendingRefundCents: 0, refundsTodayCents: 350, refundsToBuyer30dCents: 350, buyerDisputes60d: 2 });
    expect(s.executed.has(actionKey(r1))).toBe(true);
    expect(s.executed.has(actionKey(r2))).toBe(false); // itself
    expect((await localState(db, "D1", -1)).pendingRefundCents).toBe(200);
    expect((await localState(db, "D3", -1)).buyerDisputes60d).toBe(1);
  });

  it("exhibit hashes are recomputed from the stored bytes", async () => {
    const bytes = new TextEncoder().encode("%PDF synthetic");
    const good = createHash("sha256").update(bytes).digest("hex");
    await db.insert(exhibit).values({ id: "packet:D1", disputeId: "D1", orderId: "CAP-D1", name: "p.pdf", contentType: "application/pdf", sha256: good, bytes });
    const s = await localState(db, "D1", -1);
    expect(s.evidenceStore.get("packet:D1")).toEqual({ orderId: "CAP-D1", sha256: good });
    expect(s.exhibitBytesSha256.get("packet:D1")).toBe(good);
    await db.execute(sql`update exhibit set bytes = ${new TextEncoder().encode("tampered")} where id = 'packet:D1'`);
    expect((await localState(db, "D1", -1)).exhibitBytesSha256.get("packet:D1")).not.toBe(good); // -> I8_HASH_MISMATCH
  });
});

describe("reconcileFromDispute", () => {
  const d = (extra: object) => PaypalDispute.parse({ dispute_id: "D1", create_time: "t", reason: "X", status: "WAITING_FOR_SELLER_RESPONSE", dispute_amount: { currency_code: "USD", value: "10.00" }, links: [], ...extra });
  const msg: ProposedAction = { type: "SendMessage", disputeId: "D1", templateId: "EVIDENCE_SUBMITTED", slots: {} };
  it("finds a seller message by ref tag, and only ours", () => {
    expect(reconcileFromDispute(msg, d({ messages: [{ posted_by: "SELLER", content: "x [ref aaaaaaaaaaaa]" }] }), "aaaaaaaaaaaa").visible).toBe(true);
    expect(reconcileFromDispute(msg, d({ messages: [{ posted_by: "BUYER", content: "[ref aaaaaaaaaaaa]" }] }), "aaaaaaaaaaaa").visible).toBe(false);
    expect(reconcileFromDispute(msg, d({ messages: [{ posted_by: "SELLER", content: "[ref bbbbbbbbbbbb]" }] }), "aaaaaaaaaaaa").visible).toBe(false);
  });
  it("refunds never claim visibility: they rely on the idempotency key", () => {
    expect(reconcileFromDispute({ type: "IssueRefund", disputeId: "D1", amountCents: 1, currency: "USD" }, d({}), "a")).toEqual({ visible: false, how: "idempotency-key" });
  });
});
