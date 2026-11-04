// Planner: finds and cites evidence for rubric items. It sees trusted records plus quarantined enum fields,
// never raw buyer text. It outputs citations only; scoring, the decision and the action are code (rubric.ts, decide.ts).
// ponytail: the read-only "tools" run up front and their results go in the prompt, instead of a tool-calling loop.
// Same information, one call, and nothing for the planner to call. Add real tool calling if records stop fitting in a prompt.
import { z } from "zod";
import type { Llm } from "../llm";
import type { QuarantineFields } from "./quarantine";
import { INR_ITEMS, ITEM_IDS, ITEM_LABELS, SNAD_ITEMS, type Citation } from "./rubric";
import type { Scenario } from "./scenarios";

const iso = (ms: number) => new Date(ms).toISOString();

/** Read-only view of the seller's trusted records, each with a source id. No untrusted text in here. */
export function gatherRecords(s: Scenario, q: Record<string, QuarantineFields>) {
  return {
    dispute: { id: s.dispute.id, reason: s.dispute.reason, amountCents: s.dispute.amountCents, createdAt: iso(s.dispute.createdMs) },
    [`order:${s.order.id}`]: {
      paidAt: iso(s.order.paidMs), shippedAt: iso(s.order.shippedMs), handlingDays: s.order.handlingDays,
      shippingAddress: s.order.shippingAddress, item: s.order.item,
    },
    [`paypal-tracking:${s.order.id}`]: { trackingUploadedToPayPal: s.order.paypalTrackingUploaded },
    [`tracking:${s.tracking.number}`]: {
      carrier: s.tracking.carrier,
      events: s.tracking.events.map((e) => ({ id: e.id, code: e.code, at: iso(e.atMs), address: e.address ?? null, proof: e.proof ?? null })),
    },
    listing: { conditionGrade: s.listing.conditionGrade, chunks: s.listing.chunks },
    exhibits: s.exhibits.map(({ id, kind, description }) => ({ id, kind, description })),
    buyerMessages: Object.entries(q).map(([id, fields]) => ({ id, ...fields })), // quarantined fields only
  };
}

export const PlannerOutput = z.object({
  citations: z.array(z.object({ itemId: z.enum(ITEM_IDS), sourceId: z.string().max(120) })).max(30),
});

export async function plan(llm: Llm, s: Scenario, q: Record<string, QuarantineFields>): Promise<Citation[]> {
  const items = s.dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED" ? INR_ITEMS : SNAD_ITEMS;
  const itemList = Object.keys(items).map((id) => `${id}: ${ITEM_LABELS[id as keyof typeof ITEM_LABELS]}`).join("\n");
  const system = `You prepare a PayPal dispute response for a seller. For each rubric item below that the records support,
cite the ONE source id that proves it. Source ids are the keys/ids in the records (e.g. "order:...", "tracking:...",
an event id, a listing chunk id, a buyer message id, "paypal-tracking:..."). Do not cite items the records do not support.
Return ONLY JSON: {"citations":[{"itemId":"R1","sourceId":"..."}]}
Rubric items:
${itemList}`;
  const out = await llm.json({
    purpose: "planner",
    system,
    user: JSON.stringify(gatherRecords(s, q), null, 1),
    schema: PlannerOutput,
    meta: { scenarioId: s.id },
  });
  return out.citations;
}
