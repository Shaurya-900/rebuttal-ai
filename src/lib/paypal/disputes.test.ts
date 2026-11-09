import { describe, expect, it } from "vitest";
import type { ProposedAction } from "../firewall/types";
import { fromCents, toCents } from "./client";
import { buildRequest } from "./disputes";

const base = { disputeId: "PP-R-1" };

describe("money", () => {
  it("round-trips cents and rejects odd values", () => {
    expect(toCents("10.00")).toBe(1000);
    expect(toCents("3.5")).toBe(350);
    expect(toCents("7")).toBe(700);
    expect(fromCents(300)).toBe("3.00");
    expect(fromCents(1005)).toBe("10.05");
    for (const bad of ["-1.00", "1.234", "1e3", "", "10,00"]) expect(() => toCents(bad)).toThrow();
  });
});

describe("dispute action requests", () => {
  it("each action maps to the underscored rel PayPal returns", () => {
    const cases: [ProposedAction, string][] = [
      [{ type: "SubmitEvidence", ...base, exhibitIds: ["p"] }, "provide_evidence"],
      [{ type: "MakeOffer", ...base, amountCents: 300, currency: "USD", offerType: "REFUND" }, "make_offer"],
      [{ type: "AcceptClaim", ...base, amountCents: 1000, currency: "USD" }, "accept_claim"],
      [{ type: "SendMessage", ...base, templateId: "EVIDENCE_SUBMITTED", slots: {} }, "send_message"],
    ];
    for (const [a, rel] of cases) expect(buildRequest(a).rel).toBe(rel);
  });

  it("make-offer body matches schema.json (note + offer_type required, money as a string)", () => {
    expect(buildRequest({ type: "MakeOffer", ...base, amountCents: 300, currency: "USD", offerType: "REFUND" }).json).toEqual({
      note: "Offer from the seller.", offer_type: "REFUND", offer_amount: { currency_code: "USD", value: "3.00" },
    });
  });

  it("evidence is multipart with an input JSON part and the PDF file part", async () => {
    const r = buildRequest({ type: "SubmitEvidence", ...base, exhibitIds: ["p"] }, [{ name: "packet.pdf", bytes: new Uint8Array([37, 80, 68, 70]), contentType: "application/pdf" }]);
    const input = JSON.parse(await (r.form!.get("input") as Blob).text());
    expect(input.evidences[0]).toMatchObject({ evidence_type: "OTHER", documents: [{ name: "packet.pdf" }] });
    expect((r.form!.get("evidence-file") as File).name).toBe("packet.pdf");
  });

  it("messages are rendered from templates only; slot values are the only variable part", () => {
    const r = buildRequest({ type: "SendMessage", ...base, templateId: "TRACKING_UPDATE", slots: {
      orderId: { type: "orderId", value: "ORD-1", trusted: true },
      carrier: { type: "carrier", value: "USPS", trusted: true },
      trackingNumber: { type: "trackingNumber", value: "9400", trusted: true },
    } });
    expect(r.json).toEqual({ message: "Your order ORD-1 shipped with USPS, tracking 9400." });
    expect(() => buildRequest({ type: "SendMessage", ...base, templateId: "FREE_TEXT", slots: {} })).toThrow();
  });

  it("refunds and seller questions are not dispute actions", () => {
    expect(() => buildRequest({ type: "IssueRefund", ...base, amountCents: 1, currency: "USD" })).toThrow();
  });
});
