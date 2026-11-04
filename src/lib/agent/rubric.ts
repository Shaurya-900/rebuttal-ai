// Deterministic rubric. Spec: docs/rubric.md. The LLM only proposes {itemId, sourceId}; this file checks each
// citation against trusted records and awards the weight. No citation, no points. No LLM, no I/O.
import type { QuarantineFields } from "./quarantine";
import type { Scenario, TrackingEvent } from "./scenarios";

export const INR_ITEMS = { R1: 25, R2: 15, R3: 15, R4: 20, R5: 10, R6: 10, R7: 5 } as const;
export const SNAD_ITEMS = { S1: 30, S2: 15, S3: 15, S4: 15, S5: 10, S6: 10, S7: 5 } as const;
export type ItemId = keyof typeof INR_ITEMS | keyof typeof SNAD_ITEMS;
export const ITEM_IDS = [...Object.keys(INR_ITEMS), ...Object.keys(SNAD_ITEMS)] as [ItemId, ...ItemId[]];

export const ITEM_LABELS: Record<ItemId, string> = {
  R1: "Carrier DELIVERED event", R2: "Delivery address matches PayPal shipping address", R3: "Signature or photo proof of delivery",
  R4: "Buyer acknowledged receipt in writing", R5: "Shipped on time, before the dispute", R6: "Tracking uploaded to PayPal",
  R7: "No contrary carrier event after delivery",
  S1: "Listing disclosed the reported defect", S2: "Condition grade covers the defect", S3: "Dispatch photos",
  S4: "Pre-shipment inspection record", S5: "Buyer gave no evidence of the defect", S6: "Delivery confirmed",
  S7: "Reported more than 30 days after delivery",
};

export type Citation = { itemId: ItemId; sourceId: string };
export type ItemResult = { itemId: ItemId; weight: number; awarded: number; sourceId?: string; why: string };
export type RubricResult = { reason: "INR" | "SNAD"; score: number; items: ItemResult[]; citationFailures: Citation[]; capped: boolean };

const DAY = 86_400_000;
const CONTRARY = new Set<TrackingEvent["code"]>(["RETURNED_TO_SENDER", "LOST", "DAMAGED"]);
// Words a listing must contain to count as disclosing a defect (S1). Fixed list: the listing decides, not the LLM.
const DEFECT_TERMS: Record<QuarantineFields["defect"], string[]> = {
  LENS_HAZE: ["haze", "hazy", "fog", "fogging", "cloudy"],
  SCRATCH: ["scratch", "scratches", "scuff", "mark"],
  NOT_WORKING: ["not working", "for parts", "untested", "faulty"],
  WRONG_ITEM: [],
  MISSING_PART: ["missing", "no cap", "body only"],
  OTHER: [],
  NONE: [],
};
const COVERING_GRADES = ["for parts", "as is", "as-is", "untested", "not working"];

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export type RubricInput = {
  scenario: Scenario;
  quarantine: Record<string, QuarantineFields>; // by message id
  citations: Citation[];
  nowMs: number;
};

export function scoreRubric({ scenario: s, quarantine: q, citations, nowMs }: RubricInput): RubricResult {
  const isInr = s.dispute.reason === "MERCHANDISE_OR_SERVICE_NOT_RECEIVED";
  const weights: Record<string, number> = isInr ? INR_ITEMS : SNAD_ITEMS;
  const events = new Map(s.tracking.events.map((e) => [e.id, e]));
  const delivered = s.tracking.events.find((e) => e.code === "DELIVERED");
  const buyerDefect = Object.values(q).find((f) => f.defect !== "NONE")?.defect ?? "NONE";
  const chunk = (id: string) => s.listing.chunks.find((c) => c.id === id);
  const exhibit = (id: string) => s.exhibits.find((e) => e.id === id && e.orderId === s.order.id);
  const orderSrc = `order:${s.order.id}`;
  const trackingSrc = `tracking:${s.tracking.number}`;

  // Returns null if the citation holds, else why not.
  const check = (item: ItemId, src: string): string | null => {
    const ev = events.get(src);
    switch (item) {
      case "R1":
      case "S6":
        return ev?.code === "DELIVERED" ? null : "not a DELIVERED event of this shipment";
      case "R2":
        return ev?.code === "DELIVERED" && ev.address && norm(ev.address) === norm(s.order.shippingAddress) ? null : "address does not match";
      case "R3":
        return ev?.code === "DELIVERED" && ev.proof ? null : "no proof on a DELIVERED event";
      case "R4":
        return q[src]?.itemReceived === "YES" ? null : "message does not say the item arrived";
      case "R5": {
        const first = s.tracking.events.reduce((m, e) => Math.min(m, e.atMs), Infinity);
        const ok = src === orderSrc && s.order.shippedMs < s.dispute.createdMs && first <= s.order.paidMs + s.order.handlingDays * DAY;
        return ok ? null : "not shipped within handling time before the dispute";
      }
      case "R6":
        return src === `paypal-tracking:${s.order.id}` && s.order.paypalTrackingUploaded ? null : "no tracking uploaded to PayPal";
      case "R7": {
        if (src !== trackingSrc || !delivered) return "needs the full tracking history after a delivery";
        return s.tracking.events.some((e) => e.atMs > delivered.atMs && CONTRARY.has(e.code)) ? "contrary event after delivery" : null;
      }
      case "S1": {
        const c = chunk(src);
        const terms = DEFECT_TERMS[buyerDefect];
        return c && terms.some((t) => norm(c.text).includes(t)) ? null : "listing chunk does not mention the defect";
      }
      case "S2": {
        const c = chunk(src);
        return c && COVERING_GRADES.some((g) => norm(c.text).includes(g)) ? null : "condition grade does not cover the defect";
      }
      case "S3":
        return exhibit(src)?.kind === "photo" ? null : "no dispatch photo exhibit for this order";
      case "S4":
        return exhibit(src)?.kind === "inspection" ? null : "no inspection exhibit for this order";
      case "S5":
        return q[src] && q[src].buyerEvidence === "NONE" && Object.values(q).every((f) => f.buyerEvidence === "NONE")
          ? null
          : "buyer did provide evidence";
      case "S7":
        return ev?.code === "DELIVERED" && s.dispute.createdMs - ev.atMs > 30 * DAY ? null : "reported within 30 days of delivery";
    }
  };

  const items: ItemResult[] = Object.entries(weights).map(([id, weight]) => ({ itemId: id as ItemId, weight, awarded: 0, why: "not cited" }));
  const citationFailures: Citation[] = [];
  for (const c of citations) {
    const it = items.find((i) => i.itemId === c.itemId);
    if (!it) { citationFailures.push(c); continue; }
    if (it.awarded) continue; // one valid citation per item is enough
    const problem = check(c.itemId, c.sourceId);
    if (problem) { citationFailures.push(c); it.why = problem; }
    else Object.assign(it, { awarded: it.weight, sourceId: c.sourceId, why: "verified" });
  }

  let score = items.reduce((a, i) => a + i.awarded, 0);
  let capped = false;
  if (isInr && !delivered) {
    const last = s.tracking.events.reduce((m, e) => Math.max(m, e.atMs), 0);
    if (nowMs - last > 14 * DAY && score > 20) { score = 20; capped = true; }
  }
  return { reason: isInr ? "INR" : "SNAD", score, items, citationFailures, capped };
}
