// Score -> decision by expected loss. Spec: docs/rubric.md "From score to decision". Pure, no LLM.
// p, q, f and offer % are modelling assumptions on synthetic data, not measured win rates.
import type { Policy } from "../firewall/types";

export type Choice = "FIGHT" | "OFFER" | "ACCEPT";
export const DECISION_PARAMS = { lossPenaltyCents: 1000, offerAcceptQ: 0.6, defaultOfferPct: 30, minOfferPct: 10 };

export function winEstimate(score: number): number {
  return score >= 70 ? 0.9 : score >= 40 ? 0.45 : 0.1;
}

export type DecisionResult = {
  choice: Choice | "WAIT"; // WAIT: no option has a PayPal link right now
  offerCents: number;
  p: number;
  q: number;
  expectedLossCents: Partial<Record<Choice, number>>;
  removed: Choice[]; // options dropped because their link is missing
};

const LINK: Record<Choice, string> = { FIGHT: "provide_evidence", OFFER: "make_offer", ACCEPT: "accept_claim" };

export function decide(args: {
  score: number;
  reason: "INR" | "SNAD";
  delivered: boolean;
  amountCents: number;
  links: string[];
  policy: Policy;
}): DecisionResult {
  const { score, reason, delivered, amountCents: A, links, policy } = args;
  const f = DECISION_PARAMS.lossPenaltyCents;
  const p = winEstimate(score);
  const q = reason === "INR" && !delivered ? 0 : DECISION_PARAMS.offerAcceptQ;
  const pct = Math.min(Math.max(DECISION_PARAMS.defaultOfferPct, DECISION_PARAMS.minOfferPct), policy.maxOfferPct);
  const o = Math.floor((A * pct) / 100);
  const fight = (1 - p) * (A + f);
  const all: Record<Choice, number> = { FIGHT: fight, OFFER: q * o + (1 - q) * fight, ACCEPT: A };

  const order: Choice[] = ["FIGHT", "OFFER", "ACCEPT"]; // tie-break preference
  const removed = order.filter((c) => !links.includes(LINK[c]));
  const live = order.filter((c) => !removed.includes(c));
  const expectedLossCents: Partial<Record<Choice, number>> = {};
  for (const c of live) expectedLossCents[c] = Math.round(all[c]);
  // ponytail: rounding to whole cents before comparing makes float noise a tie, so the preference order decides.
  const choice = live.reduce<Choice | "WAIT">((best, c) => (best === "WAIT" || expectedLossCents[c]! < expectedLossCents[best]! ? c : best), "WAIT");
  return { choice, offerCents: choice === "OFFER" ? o : 0, p, q, expectedLossCents, removed };
}
