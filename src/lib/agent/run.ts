// The core stage on one dispute: quarantine -> plan (cite) -> rubric -> decide -> propose -> firewall.
// Returns a trace; nothing here sends anything to PayPal (the executor does, in S2/S3).
import { gate } from "../firewall/gate";
import { DEFAULT_POLICY, type Decision, type Policy, type ProposedAction, type Snapshot } from "../firewall/types";
import type { Llm, LlmCallRecord } from "../llm";
import { decide, type DecisionResult } from "./decide";
import { buildPacket, type Packet } from "./packet";
import { plan } from "./planner";
import { quarantine, type QuarantineFields } from "./quarantine";
import { scoreRubric, type Citation, type RubricResult } from "./rubric";
import type { Scenario } from "./scenarios";

export type Trace = {
  scenarioId: string;
  synthetic: true;
  quarantine: Record<string, QuarantineFields>;
  citations: Citation[];
  rubric: RubricResult;
  decision: DecisionResult;
  packet?: Omit<Packet, "bytes">;
  proposal: ProposedAction | null;
  gate: Decision | null;
  llmCalls: LlmCallRecord[];
};

/** Snapshot the firewall sees. For seeded scenarios it comes from the fixture; in S2 from a fresh PayPal fetch. */
export function snapshotFor(s: Scenario, extraEvidence: { id: string; sha256: string }[] = []): Snapshot {
  const store = new Map(s.exhibits.map((e) => [e.id, { orderId: e.orderId, sha256: e.sha256 }]));
  const bytes = new Map(s.exhibits.map((e) => [e.id, e.sha256]));
  for (const e of extraEvidence) { store.set(e.id, { orderId: s.order.id, sha256: e.sha256 }); bytes.set(e.id, e.sha256); }
  return {
    dispute: {
      id: s.dispute.id, status: s.dispute.status, links: s.dispute.links, sellerResponseDueMs: s.dispute.sellerResponseDueMs,
      amountCents: s.dispute.amountCents, currency: s.dispute.currency, orderId: s.order.id,
    },
    capture: { amountCents: s.order.amountCents, currency: s.order.currency },
    refundedCents: 0, pendingRefundCents: 0, refundsTodayCents: 0, refundsToBuyer30dCents: 0, buyerDisputes60d: 1,
    executed: new Set(), evidenceStore: store, exhibitBytesSha256: bytes,
  };
}

export async function runDispute(s: Scenario, llm: Llm, nowMs: number, policy: Policy = DEFAULT_POLICY): Promise<Trace & { packetBytes?: Uint8Array }> {
  const start = llm.calls.length;
  const q: Record<string, QuarantineFields> = {};
  for (const m of s.messages) q[m.id] = await quarantine(llm, m);

  const citations = await plan(llm, s, q);
  const rubric = scoreRubric({ scenario: s, quarantine: q, citations, nowMs });
  const delivered = s.tracking.events.some((e) => e.code === "DELIVERED");
  const decision = decide({ score: rubric.score, reason: rubric.reason, delivered, amountCents: s.dispute.amountCents, links: s.dispute.links, policy });

  let packet: Packet | undefined;
  let proposal: ProposedAction | null = null;
  const base = { disputeId: s.dispute.id };
  if (decision.choice === "FIGHT") {
    packet = await buildPacket(s, rubric, q);
    proposal = { type: "SubmitEvidence", ...base, exhibitIds: [packet.exhibitId] };
  } else if (decision.choice === "OFFER") {
    proposal = { type: "MakeOffer", ...base, amountCents: decision.offerCents, currency: s.dispute.currency, offerType: "REFUND" };
  } else if (decision.choice === "ACCEPT") {
    proposal = { type: "AcceptClaim", ...base, amountCents: s.dispute.amountCents, currency: s.dispute.currency };
  }

  const snap = snapshotFor(s, packet ? [{ id: packet.exhibitId, sha256: packet.sha256 }] : []);
  const g = proposal ? gate(proposal, snap, policy, nowMs) : null;
  return {
    scenarioId: s.id,
    synthetic: true,
    quarantine: q,
    citations,
    rubric,
    decision,
    packet: packet && { exhibitId: packet.exhibitId, sha256: packet.sha256, lines: packet.lines },
    packetBytes: packet?.bytes,
    proposal,
    gate: g,
    llmCalls: llm.calls.slice(start),
  };
}
