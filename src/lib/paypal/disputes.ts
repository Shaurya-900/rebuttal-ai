// Disputes API adapter. Request shapes: PayPal's schema.json + docs/paypal-notes.md (observed behaviour wins).
// Every side effect re-fetches the dispute and follows the HATEOAS link PayPal returns (principle 4); if the
// link is absent, nothing is sent.
import { z } from "zod";
import type { Currency, ProposedAction, Snapshot } from "../firewall/types";
import { fromCents, parseOk, PayPalError, ppRequest, toCents, type PpResponse } from "./client";

const Money = z.looseObject({ currency_code: z.string(), value: z.string() });
const Link = z.looseObject({ rel: z.string(), href: z.string(), method: z.string().optional() });

export const PaypalDispute = z.looseObject({
  dispute_id: z.string(),
  create_time: z.string(),
  update_time: z.string().optional(),
  reason: z.string(),
  status: z.string(),
  dispute_life_cycle_stage: z.string().optional(),
  dispute_amount: Money,
  seller_response_due_date: z.string().optional(),
  disputed_transactions: z.array(z.looseObject({
    seller_transaction_id: z.string().optional(),
    buyer: z.looseObject({ payer_id: z.string().optional() }).optional(),
  })).optional(),
  // Buyer/seller messages: UNTRUSTED text, only ever passed to the quarantine extractor.
  messages: z.array(z.looseObject({ posted_by: z.string().optional(), time_posted: z.string().optional(), content: z.string().optional() })).optional(),
  links: z.array(Link).default([]),
});
export type PaypalDispute = z.infer<typeof PaypalDispute>;

export const DisputeList = z.looseObject({
  items: z.array(z.looseObject({ dispute_id: z.string(), update_time: z.string().optional(), status: z.string().optional() })).default([]),
  links: z.array(Link).default([]),
});

export async function getDispute(id: string): Promise<PaypalDispute> {
  return parseOk(await ppRequest("GET", `/v1/customer/disputes/${encodeURIComponent(id)}`), PaypalDispute, `get dispute ${id}`);
}

/** Disputes updated after `sinceIso` (all pages). Used by the 30 s poller. */
export async function listDisputesUpdatedSince(sinceIso: string): Promise<z.infer<typeof DisputeList>["items"]> {
  const out: z.infer<typeof DisputeList>["items"] = [];
  let path: string | undefined = `/v1/customer/disputes?page_size=50&update_time_after=${encodeURIComponent(sinceIso)}`;
  for (let page = 0; path && page < 20; page++) {
    const list: z.infer<typeof DisputeList> = parseOk(await ppRequest("GET", path), DisputeList, "list disputes");
    out.push(...list.items);
    path = list.links.find((l) => l.rel === "next")?.href;
  }
  return out;
}

export const rels = (d: PaypalDispute) => d.links.map((l) => l.rel);

/** The dispute part of the firewall snapshot. Capture/refund totals come from elsewhere (orders.ts, intents). */
export function disputeSnapshot(d: PaypalDispute, orderId: string): Snapshot["dispute"] {
  return {
    id: d.dispute_id,
    status: d.status,
    links: rels(d),
    sellerResponseDueMs: d.seller_response_due_date ? Date.parse(d.seller_response_due_date) : NaN, // NaN -> gate fails closed
    amountCents: toCents(d.dispute_amount.value),
    currency: d.dispute_amount.currency_code as Currency,
    orderId,
  };
}

// Outbound text is fixed templates with typed slots (I6). No buyer-derived text can appear here.
const TEMPLATES: Record<string, (s: Record<string, string>) => string> = {
  TRACKING_UPDATE: (s) => `Your order ${s.orderId ?? ""} shipped with ${s.carrier ?? "the carrier"}, tracking ${s.trackingNumber ?? ""}.`,
  OFFER_EXPLANATION: (s) => `We have offered a refund of ${s.moneyCents ? fromCents(Number(s.moneyCents)) : "part of the price"} for this order.`,
  EVIDENCE_SUBMITTED: () => "We have submitted our records for this order to PayPal.",
};

export type Attachment = { name: string; bytes: Uint8Array; contentType: "application/pdf" };

/** The HATEOAS rel each action needs and the request body PayPal expects. Pure; tested without the network. */
export function buildRequest(a: ProposedAction, attachments: Attachment[] = []): { rel: string; json?: unknown; form?: FormData } {
  switch (a.type) {
    case "SubmitEvidence": {
      // multipart: JSON part "input" + file part(s) "evidence-file" (schema.json; the spike used this shape).
      const input = {
        evidences: [{ evidence_type: "OTHER", notes: "Seller records for this order are attached (Rebuttal evidence packet).", documents: attachments.map((f) => ({ name: f.name })) }],
      };
      const form = new FormData();
      form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
      for (const f of attachments) form.append("evidence-file", new Blob([new Uint8Array(f.bytes)], { type: f.contentType }), f.name);
      return { rel: "provide_evidence", form };
    }
    case "MakeOffer":
      return {
        rel: "make_offer",
        json: { note: "Offer from the seller.", offer_type: a.offerType, offer_amount: { currency_code: a.currency, value: fromCents(a.amountCents) } },
      };
    case "AcceptClaim":
      // UNVERIFIED body: schema.json documents only the file part; fields from PayPal's reference docs.
      return { rel: "accept_claim", json: { note: "Seller accepts the claim.", accept_claim_type: "REFUND" } };
    case "SendMessage": {
      // UNVERIFIED body: schema.json documents only the file part.
      const render = TEMPLATES[a.templateId];
      if (!render) throw new Error(`unknown template ${a.templateId}`);
      const slots = Object.fromEntries(Object.entries(a.slots).map(([k, v]) => [k, v.value]));
      return { rel: "send_message", json: { message: render(slots) } };
    }
    case "IssueRefund":
    case "AskSeller":
      throw new Error(`${a.type} is not a dispute action`);
  }
}

export type ActionResult = { before: PaypalDispute; res: PpResponse; href: string };

/**
 * Sends one dispute action: re-fetch, require the link, POST to the link's href.
 * The firewall must already have ALLOWed it; this is the last-moment link check, not a replacement for the gate.
 */
export async function sendDisputeAction(a: ProposedAction, opts: { attachments?: Attachment[]; requestId?: string } = {}): Promise<ActionResult> {
  const req = buildRequest(a, opts.attachments);
  const before = await getDispute(a.disputeId);
  const link = before.links.find((l) => l.rel === req.rel);
  if (!link) throw new LinkAbsentError(a.disputeId, req.rel, rels(before));
  const res = await ppRequest(link.method ?? "POST", link.href, { json: req.json, form: req.form, requestId: opts.requestId });
  if (!res.ok) throw new PayPalError(res, `${req.rel} on ${a.disputeId}`);
  return { before, res, href: link.href };
}

export class LinkAbsentError extends Error {
  constructor(public readonly disputeId: string, public readonly rel: string, public readonly present: string[]) {
    super(`no ${rel} link on ${disputeId} (links: ${present.join(", ")}); not sent`);
  }
}
