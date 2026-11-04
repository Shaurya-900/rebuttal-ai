// Keeps our `dispute` table in step with PayPal. Two inputs, one path: stored webhook events and the 30 s poll
// both end in syncDispute(), which always re-fetches the dispute (a webhook body is a hint, not the truth).
import { sql } from "drizzle-orm";
import { dispute, eventLog } from "../db/schema";
import type { Db } from "../exec/intents";
import { toCents } from "./client";
import { rels, type PaypalDispute } from "./disputes";

export type FetchDispute = (id: string) => Promise<PaypalDispute>;

export async function syncDispute(db: Db, d: PaypalDispute): Promise<void> {
  const tx0 = d.disputed_transactions?.[0];
  const row = {
    id: d.dispute_id,
    captureId: tx0?.seller_transaction_id ?? null,
    buyerPayerId: tx0?.buyer?.payer_id ?? null,
    reason: d.reason,
    status: d.status,
    stage: d.dispute_life_cycle_stage ?? null,
    amountCents: toCents(d.dispute_amount.value),
    currency: d.dispute_amount.currency_code,
    sellerResponseDueAt: d.seller_response_due_date ? new Date(d.seller_response_due_date) : null,
    raw: d as object,
    updatedAt: new Date(),
  };
  await db.transaction(async (tx) => {
    const { id: _id, ...set } = row;
    await tx.insert(dispute).values(row).onConflictDoUpdate({ target: dispute.id, set });
    await tx.insert(eventLog).values({ disputeId: d.dispute_id, kind: "dispute_synced", data: { status: d.status, stage: d.dispute_life_cycle_stage, links: rels(d) } });
  });
}

/** Drains stored webhook events. Each claimed row is processed once; a failed fetch leaves it for the next pass. */
export async function processWebhooks(db: Db, fetchDispute: FetchDispute, limit = 10): Promise<number> {
  let done = 0;
  for (let i = 0; i < limit; i++) {
    const ok = await db.transaction(async (tx) => {
      const r = await tx.execute(sql`select event_id, resource_id from webhook_event where processed_at is null
        order by received_at limit 1 for update skip locked`);
      const ev = (r as unknown as { rows: { event_id: string; resource_id: string | null }[] }).rows[0];
      if (!ev) return false;
      if (ev.resource_id) await syncDispute(tx as unknown as Db, await fetchDispute(ev.resource_id));
      await tx.execute(sql`update webhook_event set processed_at = now() where event_id = ${ev.event_id}`);
      return true;
    });
    if (!ok) break;
    done++;
  }
  return done;
}

/** One poll: every dispute PayPal says changed since `sinceIso`. Returns the next cursor. */
export async function pollOnce(
  db: Db,
  sinceIso: string,
  list: (sinceIso: string) => Promise<{ dispute_id: string; update_time?: string }[]>,
  fetchDispute: FetchDispute,
): Promise<string> {
  const items = await list(sinceIso);
  let cursor = sinceIso;
  for (const it of items) {
    await syncDispute(db, await fetchDispute(it.dispute_id));
    if (it.update_time && it.update_time > cursor) cursor = it.update_time;
  }
  return cursor;
}
