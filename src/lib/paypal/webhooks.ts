// Webhook ingestion: validate, verify with PayPal, store once (deduped on event id). Processing happens in the worker.
import { z } from "zod";
import { webhookEvent } from "../db/schema";
import type { Db } from "../exec/intents";

// Only the fields we use; extra fields are tolerated.
export const WebhookEvent = z.looseObject({
  id: z.string().min(1),
  event_type: z.string().min(1),
  resource: z.looseObject({ dispute_id: z.string().optional() }).optional(),
});

export type IngestResult = { status: 200 | 400 | 401; stored: boolean };

export async function ingestWebhook(
  db: Db,
  raw: unknown,
  verify: (event: unknown) => Promise<boolean>,
): Promise<IngestResult> {
  const parsed = WebhookEvent.safeParse(raw);
  if (!parsed.success) return { status: 400, stored: false };
  if (!(await verify(raw))) return { status: 401, stored: false };
  const ev = parsed.data;
  const rows = await db
    .insert(webhookEvent)
    .values({ eventId: ev.id, eventType: ev.event_type, resourceId: ev.resource?.dispute_id ?? null, payload: raw as object })
    .onConflictDoNothing()
    .returning({ id: webhookEvent.eventId });
  // A duplicate delivery still gets 200 so PayPal stops retrying.
  return { status: 200, stored: rows.length > 0 };
}
