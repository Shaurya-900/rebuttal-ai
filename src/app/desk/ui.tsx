import type { ReactNode } from "react";
import type { Decision } from "../../lib/firewall/types";

export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
/** Scenario titles are part of recorded prompts, so they stay as stored; this only changes how they read. */
export const displayTitle = (t: string) => t.replace(" · ", ": ");
export const gateTone = (k?: string | null) => (k === "ALLOW" ? "allow" : k === "DENY" ? "deny" : k ? "hold" : "neutral");

type Tone = "neutral" | "allow" | "deny" | "hold";
const TONE: Record<Tone, string> = {
  neutral: "bg-sunk text-graphite",
  allow: "bg-allow-tint text-allow",
  deny: "bg-deny-tint text-deny",
  hold: "bg-hold-tint text-hold",
};

/** Small inline status, for lists and tables. */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone | "green" | "red" | "amber" }) {
  const t = ({ green: "allow", red: "deny", amber: "hold" } as Record<string, Tone>)[tone] ?? (tone as Tone);
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${TONE[t]}`}>{children}</span>;
}

// Plain-words names for the firewall's rule codes (src/lib/firewall/gate.ts).
const RULE_NAMES: Record<string, string> = {
  I1_EXCEEDS_REFUNDABLE: "more than was paid", I2_NO_LINK: "PayPal does not allow it now", I2_PAST_DEADLINE: "after the deadline", I2_CLOSED: "dispute closed",
  I3_OFFER_OVER_CAP: "offer above policy", I4_DAILY_BUDGET: "over the daily budget", I4_BUYER_CAP: "over the per-buyer cap", I5_CURRENCY_MISMATCH: "wrong currency",
  I6_UNKNOWN_TEMPLATE: "unknown message", I6_UNTRUSTED_SLOT: "buyer text in a message", I6_BAD_SLOT: "malformed message", I6_URL_NOT_ALLOWED: "link not allowed",
  I7: "large accept needs the seller", I8_UNKNOWN_EXHIBIT: "exhibit not on file", I8_WRONG_ORDER: "exhibit from another order", I8_HASH_MISMATCH: "exhibit altered",
  I9_DUPLICATE: "already done", I10: "repeat disputer needs the seller", INVALID_PROPOSAL: "malformed proposal", SNAPSHOT_INCOMPLETE: "dispute state incomplete",
};
export const ruleName = (code: string) => RULE_NAMES[code] ?? code.replaceAll("_", " ").toLowerCase();

const VERDICT = {
  ALLOW: { word: "Allowed by the firewall", icon: "✓", box: "border-allow/30 bg-allow-tint/60", ink: "text-allow" },
  DENY: { word: "Blocked by the firewall", icon: "✕", box: "border-deny/30 bg-deny-tint/60", ink: "text-deny" },
  REQUIRE_APPROVAL: { word: "Held for Mira to approve", icon: "!", box: "border-hold/30 bg-hold-tint/60", ink: "text-hold" },
} as const;

/** The firewall's verdict in plain words: what happened, and which rule decided it. */
export function Verdict({ decision, className = "" }: { decision: Decision; className?: string }) {
  const v = VERDICT[decision.kind];
  const code = decision.kind === "DENY" ? decision.reason : decision.kind === "REQUIRE_APPROVAL" ? decision.rule : null;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${v.box} ${className}`}>
      <span aria-hidden className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-white text-sm font-bold ${v.ink}`}>{v.icon}</span>
      <span className="min-w-0">
        <span className={`block font-semibold ${v.ink}`}>{v.word}</span>
        <span className="block text-sm text-graphite">{code ? `Rule ${code.split("_")[0]}: ${ruleName(code)}` : "All ten rules pass"}</span>
      </span>
    </div>
  );
}

/** Plain names for the four demo cases. The stored scenario titles stay as they are: they are part of recorded prompts. */
export const CASE_NAME: Record<string, string> = {
  hero1: "“It never arrived”, but tracking says delivered",
  hero2: "The lens arrived hazy, and the listing never said so",
  hero3: "The buyer who tries to give orders",
  ctrl1: "The parcel really was lost",
};
export const caseName = (id: string, title?: string) => CASE_NAME[id] ?? displayTitle(title ?? id);

type Act = { type: string; amountCents?: number; currency?: string; exhibitIds?: string[]; tracking?: { carrier: string; trackingNumber: string }; templateId?: string; question?: string };
/** A proposed action in one plain sentence, instead of its JSON. */
export function describeAction(a: Act | null | undefined): string {
  if (!a) return "Nothing";
  const amt = a.amountCents === undefined ? "" : a.currency && a.currency !== "USD" ? `${(a.amountCents / 100).toFixed(2)} ${a.currency}` : usd(a.amountCents);
  switch (a.type) {
    case "SubmitEvidence":
      return `Send PayPal the evidence${a.tracking ? ` (delivery tracking ${a.tracking.trackingNumber})` : ""}, citing exhibit ${a.exhibitIds?.join(", ")}`;
    case "MakeOffer": return `Offer the buyer ${amt} back`;
    case "AcceptClaim": return `Accept the claim and refund ${amt}`;
    case "IssueRefund": return `Refund the buyer ${amt}`;
    case "SendMessage": return "Send the buyer a message";
    case "AskSeller": return `Ask Mira: ${a.question}`;
    default: return a.type;
  }
}

/** The quarantine's fixed fields, in words. */
export const FIELD_LABEL: Record<string, string> = {
  claimType: "What they claim", itemReceived: "Says the item arrived", defect: "Defect named", buyerEvidence: "Evidence offered",
  requestedRemedy: "What they want", mentionsAmountCents: "Amount mentioned", containsInstructions: "Tries to give the AI orders",
};
export function fieldValue(k: string, v: unknown): string {
  if (v === null || v === undefined) return "none";
  if (k === "mentionsAmountCents") return usd(Number(v));
  if (typeof v === "boolean") return v ? "yes" : "no";
  return String(v).replaceAll("_", " ").toLowerCase();
}
