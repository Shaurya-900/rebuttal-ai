// Orders v2 + Payments v2 (captures). Approve-then-capture, no vaulting (forum reports of vaulting errors).
import { z } from "zod";
import { fromCents, parseOk, ppRequest, toCents } from "./client";

const Link = z.looseObject({ rel: z.string(), href: z.string() });
const Money = z.looseObject({ currency_code: z.string(), value: z.string() });

export const Order = z.looseObject({
  id: z.string(),
  status: z.string(), // CREATED | APPROVED | COMPLETED | ...
  links: z.array(Link).default([]),
  purchase_units: z.array(z.looseObject({
    payments: z.looseObject({ captures: z.array(z.looseObject({ id: z.string(), status: z.string(), amount: Money.optional() })).optional() }).optional(),
    shipping: z.looseObject({ address: z.looseObject({}).optional() }).optional(),
  })).default([]),
});
export type Order = z.infer<typeof Order>;

export async function createOrder(o: { amountCents: number; currency: string; description: string; returnUrl: string; cancelUrl: string; requestId: string }): Promise<{ order: Order; approveUrl: string }> {
  const res = await ppRequest("POST", "/v2/checkout/orders", {
    requestId: o.requestId,
    json: {
      intent: "CAPTURE",
      purchase_units: [{ amount: { currency_code: o.currency, value: fromCents(o.amountCents) }, description: o.description.slice(0, 127) }],
      payment_source: {
        paypal: {
          experience_context: {
            user_action: "PAY_NOW",
            shipping_preference: "GET_FROM_FILE", // the buyer's PayPal address becomes the order's shipping address (rubric R2)
            return_url: o.returnUrl,
            cancel_url: o.cancelUrl,
          },
        },
      },
    },
  });
  const order = parseOk(res, Order, "create order");
  // With payment_source.paypal the approval link is "payer-action"; older flows call it "approve".
  const approveUrl = order.links.find((l) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!approveUrl) throw new Error(`create order: no approval link (debug_id ${res.debugId})`);
  return { order, approveUrl };
}

export async function getOrder(id: string): Promise<Order> {
  return parseOk(await ppRequest("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`), Order, `get order ${id}`);
}

/** Capture an APPROVED order. Same requestId -> PayPal returns the original capture instead of charging twice. */
export async function captureOrder(id: string, requestId: string): Promise<{ order: Order; captureId: string; status: string }> {
  const res = await ppRequest("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/capture`, { json: {}, requestId });
  const order = parseOk(res, Order, `capture order ${id}`);
  const cap = order.purchase_units[0]?.payments?.captures?.[0];
  if (!cap) throw new Error(`capture order ${id}: no capture in response (debug_id ${res.debugId})`);
  return { order, captureId: cap.id, status: cap.status };
}

export const Capture = z.looseObject({ id: z.string(), status: z.string(), amount: Money });

/** Capture amount for the firewall snapshot (I1, I5). Refund totals come from our intents (S3). */
export async function getCapture(id: string): Promise<{ id: string; status: string; amountCents: number; currency: string }> {
  const c = parseOk(await ppRequest("GET", `/v2/payments/captures/${encodeURIComponent(id)}`), Capture, `get capture ${id}`);
  return { id: c.id, status: c.status, amountCents: toCents(c.amount.value), currency: c.amount.currency_code };
}

export const Refund = z.looseObject({ id: z.string(), status: z.string() });

/**
 * Refund (part of) a capture. Reconcile strategy for refunds is the idempotency key: v2 has no "list refunds of a
 * capture" call, so a retry re-sends with the SAME PayPal-Request-Id and PayPal returns the original refund.
 * That PayPal honours the header on refunds is documented but UNVERIFIED in our sandbox (needs a capture first).
 */
export async function refundCapture(o: { captureId: string; amountCents: number; currency: string; ref: string; requestId: string; timeoutMs?: number }) {
  const res = await ppRequest("POST", `/v2/payments/captures/${encodeURIComponent(o.captureId)}/refund`, {
    requestId: o.requestId,
    timeoutMs: o.timeoutMs,
    json: { amount: { currency_code: o.currency, value: fromCents(o.amountCents) }, note_to_payer: `Refund from the seller [ref ${o.ref}]` },
  });
  return parseOk(res, Refund, `refund capture ${o.captureId}`);
}
