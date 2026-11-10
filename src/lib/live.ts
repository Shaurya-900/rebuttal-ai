// Read-only agent view of REAL PayPal sandbox disputes (/desk/live). Nothing here sends anything: only GET calls.
//
// What is live and what is not, per dispute:
//   live from PayPal: status, stage, amount, currency, response deadline, and the actions PayPal allows right now (links)
//   replayed:         the rubric score. Sandbox disputes come with no seller records (the sandbox item is "chalk"), so the
//                     score comes from the matching hero's SYNTHETIC records and recorded model answers (hero 1 for item
//                     not received, hero 2 for not as described). No live model call happens on this page.
//   not read:         the buyer's real messages (they would need a live quarantine call). Only their count is shown.
// The decision and the firewall then run on the LIVE PayPal state, so this shows PayPal's links deciding what is legal.
import { decide, type DecisionResult } from "./agent/decide";
import { runDispute, snapshotFor } from "./agent/run";
import { DEMO_NOW_MS, HERO1, HERO2, type Scenario } from "./agent/scenarios";
import { gate } from "./firewall/gate";
import type { Decision, Policy, ProposedAction, Snapshot } from "./firewall/types";
import { createLlm, LLM_CACHE_DIR } from "./llm";
import { disputeSnapshot, getDispute, listDisputesUpdatedSince, rels, type PaypalDispute } from "./paypal/disputes";

export type LiveRec = {
  id: string;
  reason: string;
  status: string;
  stage: string | null;
  amountCents: number;
  currency: string;
  dueIso: string | null;
  links: string[];
  buyerMessages: number;
  template: string | null; // which hero's synthetic records were scored
  score: number | null;
  decision: DecisionResult | null;
  waitingOn: string | null; // set when it is not the seller's turn
  proposal: ProposedAction | null;
  gate: Decision | null;
};

const TEMPLATE: Record<string, Scenario> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: HERO1,
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: HERO2,
};
const ACTIONS = ["provide_evidence", "make_offer", "accept_claim"];

/** One real dispute -> the recommendation and the firewall's answer. Pure apart from the replayed (offline) model answers. */
export async function recommend(d: PaypalDispute, policy: Policy, nowMs: number): Promise<LiveRec> {
  const snapDispute = disputeSnapshot(d, "");
  const base: LiveRec = {
    id: d.dispute_id, reason: d.reason, status: d.status, stage: d.dispute_life_cycle_stage ?? null,
    amountCents: snapDispute.amountCents, currency: snapDispute.currency, dueIso: d.seller_response_due_date ?? null, links: rels(d),
    buyerMessages: (d.messages ?? []).filter((m) => m.posted_by === "BUYER").length,
    template: null, score: null, decision: null, waitingOn: null, proposal: null, gate: null,
  };
  const t = TEMPLATE[d.reason];
  if (!t) return base;

  const trace = await runDispute(t, createLlm({ mode: "replay", providers: [], cacheDir: LLM_CACHE_DIR }), DEMO_NOW_MS, policy);
  base.template = t.id;
  base.score = trace.rubric.score;

  if (d.status === "RESOLVED") base.waitingOn = "Closed: PayPal has resolved this dispute.";
  else if (d.status === "WAITING_FOR_BUYER_RESPONSE") base.waitingOn = "The buyer's turn: the seller has answered and PayPal is waiting for the buyer.";
  else if (!base.links.some((l) => ACTIONS.includes(l))) base.waitingOn = "PayPal allows no seller action right now (it can take a few minutes after a change).";
  if (base.waitingOn) return base;

  const delivered = t.tracking.events.some((e) => e.code === "DELIVERED");
  const decision = decide({ score: trace.rubric.score, reason: trace.rubric.reason, delivered, amountCents: base.amountCents, links: base.links, policy });
  base.decision = decision;

  const disputeId = d.dispute_id;
  const currency = snapDispute.currency;
  if (decision.choice === "FIGHT" && trace.packet) {
    base.proposal = { type: "SubmitEvidence", disputeId, exhibitIds: [trace.packet.exhibitId] };
    if (trace.rubric.reason === "INR") base.proposal.tracking = { carrier: t.tracking.carrier, trackingNumber: t.tracking.number };
  } else if (decision.choice === "OFFER") base.proposal = { type: "MakeOffer", disputeId, amountCents: decision.offerCents, currency, offerType: "REFUND" };
  else if (decision.choice === "ACCEPT") base.proposal = { type: "AcceptClaim", disputeId, amountCents: base.amountCents, currency };

  if (base.proposal) {
    // The firewall sees the LIVE dispute (status, links, deadline, amount). The capture is assumed to equal the disputed amount:
    // the sandbox payments were full-amount disputes. Order and evidence come from the template's records.
    const s = snapshotFor(t, trace.packet ? [{ id: trace.packet.exhibitId, sha256: trace.packet.sha256 }] : []);
    const snap: Snapshot = { ...s, dispute: { ...disputeSnapshot(d, t.order.id) }, capture: { amountCents: base.amountCents, currency } };
    base.gate = gate(base.proposal, snap, policy, nowMs);
  }
  return base;
}

type Result = { ok: true; fetchedAt: string; items: LiveRec[] } | { ok: false; fetchedAt: string; error: string };
let memo: { at: number; value: Result } | null = null;

/** Lists recent sandbox disputes and recommends for each. Cached for 60 s so page views don't hammer PayPal. */
export async function liveRecommendations(policy: Policy, nowMs = Date.now()): Promise<Result> {
  if (memo && nowMs - memo.at < 60_000) return memo.value;
  let value: Result;
  try {
    const listed = await listDisputesUpdatedSince(new Date(nowMs - 30 * 86_400_000).toISOString());
    const disputes = await Promise.all(listed.slice(0, 10).map((x) => getDispute(x.dispute_id)));
    const items = await Promise.all(disputes.map((d) => recommend(d, policy, nowMs)));
    value = { ok: true, fetchedAt: new Date(nowMs).toISOString(), items };
  } catch (e) {
    // Error text from our adapter never contains the secret or token (client.ts); keep it short anyway.
    value = { ok: false, fetchedAt: new Date(nowMs).toISOString(), error: e instanceof Error ? e.message.slice(0, 200) : "unknown error" };
  }
  memo = { at: nowMs, value };
  return value;
}
