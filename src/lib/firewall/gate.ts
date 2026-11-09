// The action firewall. Pure: same inputs -> same decision, no I/O, no clock, no LLM.
// Spec and rule ids: docs/invariants.md.
import { createHash } from "node:crypto";
import {
  ProposedAction,
  MESSAGE_TEMPLATES,
  type Decision,
  type Fired,
  type Policy,
  type Snapshot,
} from "./types";

const REQUIRED_REL: Record<ProposedAction["type"], string | null> = {
  SubmitEvidence: "provide_evidence",
  MakeOffer: "make_offer",
  AcceptClaim: "accept_claim",
  SendMessage: "send_message",
  IssueRefund: null,
  AskSeller: null,
};

const CARRIERS = new Set(["USPS", "UPS", "FEDEX", "DHL", "INDIA_POST", "SYNTHETIC_CARRIER"]);

export function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

export function actionKey(a: ProposedAction): string {
  const { type, disputeId, ...params } = a;
  const hash = createHash("sha256").update(canonicalJson(params)).digest("hex");
  return `${disputeId}|${type}|${hash}`;
}

export function moneyCents(a: ProposedAction): number {
  return a.type === "MakeOffer" || a.type === "AcceptClaim" || a.type === "IssueRefund" ? a.amountCents : 0;
}

function snapshotComplete(s: Snapshot): boolean {
  const nums = [
    s.dispute.sellerResponseDueMs, s.dispute.amountCents, s.capture.amountCents, s.refundedCents,
    s.pendingRefundCents, s.refundsTodayCents, s.refundsToBuyer30dCents, s.buyerDisputes60d,
  ];
  return nums.every((n) => Number.isFinite(n) && n >= 0) && !!s.dispute.id && !!s.dispute.status && Array.isArray(s.dispute.links);
}

function hostAllowed(url: string, allow: string[]): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && allow.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function slotProblem(type: string, value: string, allow: string[]): string | null {
  switch (type) {
    case "orderId":
    case "trackingNumber":
      return /^[A-Za-z0-9-]{1,64}$/.test(value) ? null : "I6_BAD_SLOT";
    case "carrier":
      return CARRIERS.has(value) ? null : "I6_BAD_SLOT";
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(value) ? null : "I6_BAD_SLOT";
    case "moneyCents":
      return /^\d{1,9}$/.test(value) ? null : "I6_BAD_SLOT";
    case "url":
      return hostAllowed(value, allow) ? null : "I6_URL_NOT_ALLOWED";
    default:
      return "I6_BAD_SLOT";
  }
}

/** `approved` satisfies REQUIRE_APPROVAL rules only; DENY rules always apply (ground rule 5). */
export function gate(
  input: unknown,
  snap: Snapshot,
  policy: Policy,
  nowMs: number,
  opts: { approved?: boolean } = {},
): Decision {
  const parsed = ProposedAction.safeParse(input);
  if (!parsed.success) return { kind: "DENY", reason: "INVALID_PROPOSAL", fired: [{ rule: "INVALID_PROPOSAL", outcome: "DENY" }] };
  if (!snapshotComplete(snap)) return { kind: "DENY", reason: "SNAPSHOT_INCOMPLETE", fired: [{ rule: "SNAPSHOT_INCOMPLETE", outcome: "DENY" }] };
  const a = parsed.data;
  const d = snap.dispute;
  const amount = moneyCents(a);
  const isMoney = a.type === "MakeOffer" || a.type === "AcceptClaim" || a.type === "IssueRefund";
  const fired: Fired[] = [];
  const deny = (rule: string) => fired.push({ rule, outcome: "DENY" });
  const approval = (rule: string) => fired.push({ rule, outcome: "REQUIRE_APPROVAL" });

  if (a.disputeId !== d.id) deny("DISPUTE_MISMATCH");

  // I1: never pay out more than is left on the capture.
  if (isMoney && amount > snap.capture.amountCents - snap.refundedCents - snap.pendingRefundCents) deny("I1_EXCEEDS_REFUNDABLE");

  // I2: PayPal must currently allow it. AskSeller is internal; IssueRefund has no dispute link.
  // ponytail: deadline only applies to link-backed actions; a plain refund after the deadline is still legitimate.
  const rel = REQUIRED_REL[a.type];
  if (a.type !== "AskSeller") {
    if (d.status === "RESOLVED") deny("I2_CLOSED");
    if (rel && !d.links.includes(rel)) deny("I2_NO_LINK");
    if (rel && nowMs >= d.sellerResponseDueMs) deny("I2_PAST_DEADLINE");
  }

  // I3: offer cap.
  if (a.type === "MakeOffer" && a.amountCents > Math.floor((d.amountCents * policy.maxOfferPct) / 100)) deny("I3_OFFER_OVER_CAP");

  // I4: budgets.
  if (isMoney && snap.refundsTodayCents + amount > policy.dailyRefundBudgetCents) deny("I4_DAILY_BUDGET");
  if (isMoney && snap.refundsToBuyer30dCents + amount > policy.perBuyerCap30dCents) deny("I4_BUYER_CAP");

  // I5: currency.
  if (isMoney && (a.currency !== snap.capture.currency || a.currency !== d.currency)) deny("I5_CURRENCY_MISMATCH");

  // I6: templates with typed, trusted slots only.
  if (a.type === "SendMessage") {
    if (!(MESSAGE_TEMPLATES as readonly string[]).includes(a.templateId)) deny("I6_UNKNOWN_TEMPLATE");
    for (const slot of Object.values(a.slots)) {
      if (!slot.trusted) deny("I6_UNTRUSTED_SLOT");
      const p = slotProblem(slot.type, slot.value, policy.messageUrlAllowlist);
      if (p) deny(p);
    }
  }

  // I8: exhibits exist, belong to this order, bytes unchanged.
  if (a.type === "SubmitEvidence") {
    for (const id of a.exhibitIds) {
      const ex = snap.evidenceStore.get(id);
      if (!ex) deny("I8_UNKNOWN_EXHIBIT");
      else if (ex.orderId !== d.orderId) deny("I8_WRONG_ORDER");
      else if (snap.exhibitBytesSha256.get(id) !== ex.sha256) deny("I8_HASH_MISMATCH");
    }
  }

  // I9: at most once.
  if (snap.executed.has(actionKey(a))) deny("I9_DUPLICATE");

  // I7, I10: human approval.
  if (a.type === "AcceptClaim" && a.amountCents > policy.autoAcceptMaxCents) approval("I7");
  if (isMoney && snap.buyerDisputes60d >= policy.repeatDisputerThreshold) approval("I10");

  const firstDeny = fired.find((f) => f.outcome === "DENY");
  if (firstDeny) return { kind: "DENY", reason: firstDeny.rule, fired };
  const firstApproval = fired.find((f) => f.outcome === "REQUIRE_APPROVAL");
  if (firstApproval && !opts.approved) return { kind: "REQUIRE_APPROVAL", rule: firstApproval.rule, fired };
  return { kind: "ALLOW", fired };
}
