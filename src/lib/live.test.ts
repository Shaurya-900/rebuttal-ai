// Read-only recommendations on live dispute state: PayPal's links, status and deadline drive the outcome. No network.
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "./firewall/types";
import { recommend } from "./live";
import type { PaypalDispute } from "./paypal/disputes";

const NOW = Date.UTC(2026, 10, 10, 12, 0);
const link = (rel: string) => ({ rel, href: `https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-TEST/${rel}`, method: "POST" });
const dispute = (over: Partial<PaypalDispute> & { rels?: string[] }): PaypalDispute => ({
  dispute_id: "PP-R-TEST", create_time: "2026-11-09T22:12:33Z", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  status: "WAITING_FOR_SELLER_RESPONSE", dispute_life_cycle_stage: "INQUIRY", dispute_amount: { currency_code: "USD", value: "10.00" },
  seller_response_due_date: "2026-11-29T22:12:33Z", links: (over.rels ?? ["self", "provide_evidence", "make_offer", "accept_claim"]).map(link), ...over,
});

describe("live recommendations (read-only)", () => {
  it("strong INR records + evidence allowed -> FIGHT, ALLOWED on the live dispute id, with tracking", async () => {
    const r = await recommend(dispute({}), DEFAULT_POLICY, NOW);
    expect(r).toMatchObject({ template: "hero1", score: 85, decision: { choice: "FIGHT" }, gate: { kind: "ALLOW" } });
    expect(r.proposal).toMatchObject({ type: "SubmitEvidence", disputeId: "PP-R-TEST", tracking: { trackingNumber: "SYNHERO101" } });
  });

  it("PayPal's links decide: without provide_evidence the fight option is dropped", async () => {
    const r = await recommend(dispute({ rels: ["self", "make_offer", "accept_claim"] }), DEFAULT_POLICY, NOW);
    expect(r.decision?.removed).toContain("FIGHT");
    expect(r.decision?.choice).not.toBe("FIGHT");
  });

  it("past the live deadline the firewall denies, whatever the decision", async () => {
    const r = await recommend(dispute({ seller_response_due_date: "2026-11-01T00:00:00Z" }), DEFAULT_POLICY, NOW);
    expect(r.gate).toMatchObject({ kind: "DENY", reason: "I2_PAST_DEADLINE" });
  });

  it("buyer's turn, closed, or no action links -> wait, and nothing is proposed", async () => {
    for (const d of [dispute({ status: "WAITING_FOR_BUYER_RESPONSE" }), dispute({ status: "RESOLVED" }), dispute({ rels: ["self"] })]) {
      const r = await recommend(d, DEFAULT_POLICY, NOW);
      expect(r.waitingOn).toBeTruthy();
      expect(r.proposal).toBeNull();
    }
  });

  it("a reason with no template is listed but not scored", async () => {
    const r = await recommend(dispute({ reason: "UNAUTHORISED" }), DEFAULT_POLICY, NOW);
    expect(r).toMatchObject({ template: null, score: null, proposal: null });
  });
});
