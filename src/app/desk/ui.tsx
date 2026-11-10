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

/** The firewall's verdict as an ink stamp: the one loud element on any page. */
export function Stamp({ decision, land = false, className = "" }: { decision: Decision; land?: boolean; className?: string }) {
  const [word, tone, code] =
    decision.kind === "ALLOW" ? ["ALLOWED", "text-allow", null] : decision.kind === "DENY" ? ["DENIED", "text-deny", decision.reason] : ["HELD FOR SELLER", "text-hold", decision.rule];
  return (
    <span role="img" aria-label={`Firewall: ${word.toLowerCase()}${code ? `, rule ${code}, ${ruleName(code)}` : ""}`} className={`stamp ${land ? "stamp-land" : ""} ${tone} ${className}`}>
      <span className="text-base sm:text-lg">{word}</span>
      <small>{code ? `${code.split("_")[0]}: ${ruleName(code)}` : "all ten rules pass"}</small>
    </span>
  );
}
