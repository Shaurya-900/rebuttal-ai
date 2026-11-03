// Firewall types. Spec: docs/invariants.md. Money is integer cents; time is epoch ms UTC.
import { z } from "zod";

export const Currency = z.enum(["USD", "EUR", "GBP", "INR"]);
export type Currency = z.infer<typeof Currency>;
const Cents = z.number().int().nonnegative();

export const MESSAGE_TEMPLATES = ["TRACKING_UPDATE", "OFFER_EXPLANATION", "EVIDENCE_SUBMITTED"] as const;

// A slot value is tagged with where it came from; buyer-derived values are untrusted (I6).
export const SlotValue = z.object({
  type: z.enum(["orderId", "trackingNumber", "carrier", "date", "moneyCents", "url"]),
  value: z.string().max(200),
  trusted: z.boolean(),
});

export const ProposedAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SubmitEvidence"), disputeId: z.string(), exhibitIds: z.array(z.string()).min(1) }),
  z.object({ type: z.literal("MakeOffer"), disputeId: z.string(), amountCents: Cents, currency: Currency,
    offerType: z.enum(["REFUND", "REFUND_WITH_RETURN", "REFUND_WITH_REPLACEMENT", "REPLACEMENT_WITHOUT_REFUND"]) }),
  z.object({ type: z.literal("AcceptClaim"), disputeId: z.string(), amountCents: Cents, currency: Currency }),
  z.object({ type: z.literal("SendMessage"), disputeId: z.string(), templateId: z.string(), slots: z.record(z.string(), SlotValue) }),
  z.object({ type: z.literal("IssueRefund"), disputeId: z.string(), amountCents: Cents, currency: Currency }),
  z.object({ type: z.literal("AskSeller"), disputeId: z.string(), question: z.string().max(500) }),
]);
export type ProposedAction = z.infer<typeof ProposedAction>;

export type Snapshot = {
  dispute: {
    id: string;
    status: string;
    links: string[]; // HATEOAS rels as PayPal returns them (underscored, see docs/paypal-notes.md)
    sellerResponseDueMs: number;
    amountCents: number;
    currency: Currency;
    orderId: string;
  };
  capture: { amountCents: number; currency: Currency };
  refundedCents: number;
  pendingRefundCents: number;
  refundsTodayCents: number;
  refundsToBuyer30dCents: number;
  buyerDisputes60d: number; // counting this one
  executed: ReadonlySet<string>; // "disputeId|actionType|paramsHash"
  evidenceStore: ReadonlyMap<string, { orderId: string; sha256: string }>;
  exhibitBytesSha256: ReadonlyMap<string, string>; // hash of the bytes about to be uploaded
};

export type Policy = {
  maxOfferPct: number;
  autoAcceptMaxCents: number;
  dailyRefundBudgetCents: number;
  perBuyerCap30dCents: number;
  repeatDisputerThreshold: number;
  messageUrlAllowlist: string[]; // hostnames
};

export const DEFAULT_POLICY: Policy = {
  maxOfferPct: 50,
  autoAcceptMaxCents: 2500,
  dailyRefundBudgetCents: 20000,
  perBuyerCap30dCents: 10000,
  repeatDisputerThreshold: 3,
  messageUrlAllowlist: ["paypal.com"],
};

export type Fired = { rule: string; outcome: "DENY" | "REQUIRE_APPROVAL" };
export type Decision =
  | { kind: "ALLOW"; fired: Fired[] }
  | { kind: "REQUIRE_APPROVAL"; rule: string; fired: Fired[] }
  | { kind: "DENY"; reason: string; fired: Fired[] };
