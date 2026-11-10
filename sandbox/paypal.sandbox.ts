// Real-sandbox checks for the PayPal adapter. Default run is read-only plus creating (never approving) orders.
// Dispute-changing actions run only when you name a dispute and ONE action:
//   SANDBOX_MUTATE_DISPUTE_ID=PP-R-... SANDBOX_MUTATE_ACTION=make_offer npm run test:sandbox
// (make_offer | send_message | accept_claim | provide_evidence). Each one changes or closes that dispute.
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { ProposedAction } from "../src/lib/firewall/types";
import { accessToken, fromCents, toCents } from "../src/lib/paypal/client";
import { disputeSnapshot, getDispute, LinkAbsentError, listDisputesUpdatedSince, rels, sendDisputeAction } from "../src/lib/paypal/disputes";
import { PayPalError } from "../src/lib/paypal/client";
import { createOrder, getCapture, getOrder } from "../src/lib/paypal/orders";

const KNOWN = process.env.SANDBOX_DISPUTE_ID ?? "PP-R-HQO-10196189"; // escalated spike dispute (CHARGEBACK stage)

describe("sandbox: read-only", () => {
  it("client-credentials token", async () => {
    expect((await accessToken()).length).toBeGreaterThan(20);
  });

  it("list disputes parses with our tolerant schema", async () => {
    const items = await listDisputesUpdatedSince(new Date(Date.now() - 30 * 86_400_000).toISOString());
    expect(Array.isArray(items)).toBe(true);
    console.log(`disputes updated in 30 days: ${items.map((i) => `${i.dispute_id}(${i.status})`).join(", ") || "none"}`);
  });

  it("get dispute -> snapshot with integer cents, underscored rels and a deadline", async () => {
    const d = await getDispute(KNOWN);
    const s = disputeSnapshot(d, "unknown-order");
    console.log(`${KNOWN}: ${d.status}/${d.dispute_life_cycle_stage} links=${rels(d).join(",")} due=${d.seller_response_due_date}`);
    expect(s.amountCents).toBe(toCents(d.dispute_amount.value));
    expect(rels(d)).toContain("self");
    expect(rels(d).every((r) => !r.includes("-"))).toBe(true);
  });

  it("an action whose link is absent is refused before anything is sent", async () => {
    const d = await getDispute(KNOWN);
    const missing = (["make_offer", "send_message", "accept_claim", "provide_evidence"] as const).find((r) => !rels(d).includes(r));
    if (!missing) return console.log("every action link is present on this dispute; nothing to refuse");
    const actions: Record<string, ProposedAction> = {
      make_offer: { type: "MakeOffer", disputeId: KNOWN, amountCents: 100, currency: "USD", offerType: "REFUND" },
      send_message: { type: "SendMessage", disputeId: KNOWN, templateId: "EVIDENCE_SUBMITTED", slots: {} },
      accept_claim: { type: "AcceptClaim", disputeId: KNOWN, amountCents: 100, currency: "USD" },
      provide_evidence: { type: "SubmitEvidence", disputeId: KNOWN, exhibitIds: ["x"] },
    };
    await expect(sendDisputeAction(actions[missing]!)).rejects.toBeInstanceOf(LinkAbsentError);
  });
});

describe("sandbox: orders", () => {
  it("create order returns an approval link; the same PayPal-Request-Id returns the same order", async () => {
    const requestId = `sandbox-test-${randomUUID()}`;
    const args = { amountCents: 1000, currency: "USD", description: "SYNTHETIC sandbox test (never approved)", returnUrl: "https://example.com/r", cancelUrl: "https://example.com/c", requestId };
    const a = await createOrder(args);
    const b = await createOrder(args);
    console.log(`order ${a.order.id} status ${a.order.status}; replay -> ${b.order.id}`);
    expect(a.approveUrl).toMatch(/^https:\/\/www\.sandbox\.paypal\.com\//);
    expect(b.order.id).toBe(a.order.id);
    const got = await getOrder(a.order.id); // SDK getOrder, read-only
    expect(got.status).toBe("PAYER_ACTION_REQUIRED");
  });

  it("an SDK error becomes a PayPalError with the HTTP status (read-only: unknown capture id)", async () => {
    const e = await getCapture("0NOSUCHCAPTURE00").catch((x) => x);
    console.log(`get unknown capture -> ${e instanceof Error ? e.message : e}`);
    expect(e).toBeInstanceOf(PayPalError);
    expect((e as PayPalError).res.status).toBeGreaterThanOrEqual(400);
  });
});

const mutateId = process.env.SANDBOX_MUTATE_DISPUTE_ID;
const mutateAction = process.env.SANDBOX_MUTATE_ACTION;
describe.skipIf(!mutateId || !mutateAction)("sandbox: ONE dispute action (opt-in)", () => {
  it(`${mutateAction} on ${mutateId}`, async () => {
    const id = mutateId!;
    const d = await getDispute(id);
    const amount = toCents(d.dispute_amount.value);
    const actions: Record<string, ProposedAction> = {
      make_offer: { type: "MakeOffer", disputeId: id, amountCents: Math.floor(amount * 0.3), currency: d.dispute_amount.currency_code as "USD", offerType: "REFUND" },
      send_message: { type: "SendMessage", disputeId: id, templateId: "EVIDENCE_SUBMITTED", slots: {} },
      accept_claim: { type: "AcceptClaim", disputeId: id, amountCents: amount, currency: d.dispute_amount.currency_code as "USD" },
      provide_evidence: { type: "SubmitEvidence", disputeId: id, exhibitIds: ["sandbox-test"], tracking: { carrier: "USPS", trackingNumber: "9400100000000000000000" } }, // synthetic tracking number
    };
    const a = actions[mutateAction!];
    if (!a) throw new Error(`SANDBOX_MUTATE_ACTION must be one of ${Object.keys(actions).join(", ")}`);
    const pdf = new TextEncoder().encode("%PDF-1.4\n% SYNTHETIC sandbox test\n%%EOF\n");
    const r = await sendDisputeAction(a, { attachments: a.type === "SubmitEvidence" ? [{ name: "sandbox-test.pdf", bytes: pdf, contentType: "application/pdf" }] : [], requestId: `sandbox-${randomUUID()}` });
    console.log(`${mutateAction}: HTTP ${r.res.status} debug_id ${r.res.debugId} amount ${a.type === "MakeOffer" ? fromCents(a.amountCents) : "-"}`);
    const after = await getDispute(id);
    console.log(`after: ${after.status}/${after.dispute_life_cycle_stage} links=${rels(after).join(",")}`);
    expect(r.res.ok).toBe(true);
  });
});
