import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../exec/intents";
import { PaypalDispute } from "./disputes";
import { pollOnce, processWebhooks } from "./sync";
import { ingestWebhook } from "./webhooks";

let db: Db;
beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as Db;
});

// Shape as observed on PP-R-HQO-10196189 (docs/paypal-notes.md), trimmed.
const dispute = (status: string, links: string[]) => PaypalDispute.parse({
  dispute_id: "PP-R-TEST-1", create_time: "2026-11-03T16:30:35.522Z", update_time: "2026-11-03T16:49:46Z",
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status, dispute_life_cycle_stage: "INQUIRY",
  dispute_amount: { currency_code: "USD", value: "10.00" }, seller_response_due_date: "2026-11-23T16:30:35.522Z",
  disputed_transactions: [{ seller_transaction_id: "CAP-1", buyer: { payer_id: "BUYER-1" } }],
  links: links.map((rel) => ({ rel, href: `https://api-m.sandbox.paypal.com/x/${rel}`, method: "POST" })),
  some_new_field_paypal_added: { anything: true },
});
const rows = async (q: string) => ((await db.execute(sql.raw(q))) as unknown as { rows: Record<string, unknown>[] }).rows;

describe("dispute sync", () => {
  it("a webhook stores once, the worker re-fetches the dispute and upserts it", async () => {
    const ev = { id: "WH-1", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-R-TEST-1" } };
    await ingestWebhook(db, ev, async () => true);
    await ingestWebhook(db, ev, async () => true); // duplicate delivery (A6)
    let fetches = 0;
    expect(await processWebhooks(db, async () => { fetches++; return dispute("WAITING_FOR_SELLER_RESPONSE", ["self", "make_offer"]); })).toBe(1);
    expect(fetches).toBe(1);
    expect(await rows("select status, amount_cents, capture_id, buyer_payer_id from dispute")).toEqual([
      { status: "WAITING_FOR_SELLER_RESPONSE", amount_cents: 1000, capture_id: "CAP-1", buyer_payer_id: "BUYER-1" },
    ]);
    expect(await processWebhooks(db, async () => { throw new Error("must not fetch again"); })).toBe(0);
  });

  it("a failed fetch leaves the event unprocessed for the next pass", async () => {
    await ingestWebhook(db, { id: "WH-2", event_type: "CUSTOMER.DISPUTE.UPDATED", resource: { dispute_id: "PP-R-TEST-1" } }, async () => true);
    await expect(processWebhooks(db, async () => { throw new Error("PayPal 503"); })).rejects.toThrow("503");
    expect(await rows("select processed_at from webhook_event")).toEqual([{ processed_at: null }]);
    expect(await processWebhooks(db, async () => dispute("UNDER_REVIEW", ["self"]))).toBe(1);
  });

  it("the poll upserts changed disputes and advances the cursor", async () => {
    const since = "2026-11-01T00:00:00Z";
    const next = await pollOnce(db, since, async () => [{ dispute_id: "PP-R-TEST-1", update_time: "2026-11-03T16:49:46Z" }],
      async () => dispute("UNDER_REVIEW", ["self"]));
    expect(next).toBe("2026-11-03T16:49:46Z");
    await pollOnce(db, next, async () => [{ dispute_id: "PP-R-TEST-1" }], async () => dispute("WAITING_FOR_SELLER_RESPONSE", ["self", "provide_evidence"]));
    expect(await rows("select status from dispute")).toEqual([{ status: "WAITING_FOR_SELLER_RESPONSE" }]);
    expect((await rows("select count(*)::int as n from event_log where kind = 'dispute_synced'"))[0]!.n).toBe(2);
  });
});
