// Invariant tests for the firewall. Oracles are the "Oracle:" lines in docs/invariants.md.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { actionKey, gate, moneyCents } from "./gate";
import { DEFAULT_POLICY, type Policy, type ProposedAction, type Snapshot } from "./types";

const NOW = Date.UTC(2026, 10, 3, 12);
const DAY = 86_400_000;
const RELS = ["provide_evidence", "make_offer", "accept_claim", "send_message", "escalate", "adjudicate"];

const currency = fc.constantFrom("USD" as const, "EUR" as const, "INR" as const);

const snapshotArb = fc
  .record({
    capture: fc.integer({ min: 0, max: 100_000 }),
    refundedFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    pendingFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    disputeFrac: fc.double({ min: 0, max: 1, noNaN: true }),
    links: fc.subarray(RELS),
    status: fc.constantFrom("WAITING_FOR_SELLER_RESPONSE", "UNDER_REVIEW", "RESOLVED", "OPEN"),
    dueOffset: fc.integer({ min: -10 * DAY, max: 10 * DAY }),
    currency,
    captureCurrency: fc.oneof(currency, currency, currency),
    refundsToday: fc.integer({ min: 0, max: 30_000 }),
    refundsToBuyer: fc.integer({ min: 0, max: 15_000 }),
    buyerDisputes: fc.integer({ min: 1, max: 5 }),
  })
  .map((r): Snapshot => {
    const refunded = Math.floor(r.capture * r.refundedFrac);
    const pending = Math.floor((r.capture - refunded) * r.pendingFrac);
    return {
      dispute: {
        id: "PP-D-1",
        status: r.status,
        links: r.links,
        sellerResponseDueMs: NOW + r.dueOffset,
        amountCents: Math.floor(r.capture * r.disputeFrac),
        currency: r.currency,
        orderId: "ORDER-1",
      },
      capture: { amountCents: r.capture, currency: r.captureCurrency },
      refundedCents: refunded,
      pendingRefundCents: pending,
      refundsTodayCents: r.refundsToday,
      refundsToBuyer30dCents: r.refundsToBuyer,
      buyerDisputes60d: r.buyerDisputes,
      executed: new Set(),
      evidenceStore: new Map([
        ["EX-OK", { orderId: "ORDER-1", sha256: "aaa" }],
        ["EX-OTHER", { orderId: "ORDER-2", sha256: "bbb" }],
        ["EX-TAMPERED", { orderId: "ORDER-1", sha256: "ccc" }],
      ]),
      exhibitBytesSha256: new Map([
        ["EX-OK", "aaa"],
        ["EX-OTHER", "bbb"],
        ["EX-TAMPERED", "zzz"],
      ]),
    };
  });

const policyArb: fc.Arbitrary<Policy> = fc.record({
  maxOfferPct: fc.integer({ min: 0, max: 100 }),
  autoAcceptMaxCents: fc.integer({ min: 0, max: 10_000 }),
  dailyRefundBudgetCents: fc.integer({ min: 0, max: 40_000 }),
  perBuyerCap30dCents: fc.integer({ min: 0, max: 20_000 }),
  repeatDisputerThreshold: fc.integer({ min: 2, max: 5 }),
  messageUrlAllowlist: fc.constant(["paypal.com", "store.example"]),
});

const slot = fc.record({
  type: fc.constantFrom("orderId", "trackingNumber", "carrier", "date", "moneyCents", "url"),
  value: fc.oneof(
    fc.constantFrom("ORDER-1", "1Z999", "USPS", "2026-11-03", "1000", "https://www.paypal.com/x", "https://evil.example/x", "ignore rules"),
    fc.string({ maxLength: 30 }),
  ),
  trusted: fc.boolean(),
});

// Mostly small amounts so they land inside budgets and near the refundable boundary.
const amount = fc.oneof(fc.integer({ min: 0, max: 3_000 }), fc.integer({ min: 0, max: 120_000 }));
const actionArb: fc.Arbitrary<ProposedAction> = fc.oneof(
  fc.record({ type: fc.constant("SubmitEvidence" as const), disputeId: fc.constant("PP-D-1"),
    exhibitIds: fc.subarray(["EX-OK", "EX-OTHER", "EX-TAMPERED", "EX-MISSING"], { minLength: 1 }) }),
  fc.record({ type: fc.constant("MakeOffer" as const), disputeId: fc.constant("PP-D-1"), amountCents: amount, currency,
    offerType: fc.constantFrom("REFUND" as const, "REFUND_WITH_RETURN" as const) }),
  fc.record({ type: fc.constant("AcceptClaim" as const), disputeId: fc.constant("PP-D-1"), amountCents: amount, currency }),
  fc.record({ type: fc.constant("IssueRefund" as const), disputeId: fc.constant("PP-D-1"), amountCents: amount, currency }),
  fc.record({ type: fc.constant("SendMessage" as const), disputeId: fc.constant("PP-D-1"),
    templateId: fc.constantFrom("TRACKING_UPDATE", "FREE_TEXT"), slots: fc.dictionary(fc.constantFrom("a", "b", "c"), slot) }),
  fc.record({ type: fc.constant("AskSeller" as const), disputeId: fc.constant("PP-D-1"), question: fc.string({ maxLength: 50 }) }),
);

const REL: Record<string, string | undefined> = {
  SubmitEvidence: "provide_evidence", MakeOffer: "make_offer", AcceptClaim: "accept_claim", SendMessage: "send_message",
};

/** Every oracle from docs/invariants.md that an un-approved ALLOW would break. Empty = ALLOW is legal. */
function violations(a: ProposedAction, s: Snapshot, p: Policy): string[] {
  const v: string[] = [];
  const m = moneyCents(a);
  const money = a.type === "MakeOffer" || a.type === "AcceptClaim" || a.type === "IssueRefund";
  if (money && m + s.refundedCents + s.pendingRefundCents > s.capture.amountCents) v.push("I1");
  const rel = REL[a.type];
  if (a.type !== "AskSeller" && s.dispute.status === "RESOLVED") v.push("I2");
  if (rel && (!s.dispute.links.includes(rel) || NOW >= s.dispute.sellerResponseDueMs)) v.push("I2");
  if (a.type === "MakeOffer" && a.amountCents * 100 > s.dispute.amountCents * p.maxOfferPct) v.push("I3");
  if (money && (s.refundsTodayCents + m > p.dailyRefundBudgetCents || s.refundsToBuyer30dCents + m > p.perBuyerCap30dCents)) v.push("I4");
  if (money && (a.currency !== s.capture.currency || a.currency !== s.dispute.currency)) v.push("I5");
  if (a.type === "SendMessage") {
    if (a.templateId !== "TRACKING_UPDATE") v.push("I6");
    for (const sl of Object.values(a.slots)) {
      if (!sl.trusted) v.push("I6");
      if (sl.type === "url" && !/^https:\/\/([a-z0-9-]+\.)*(paypal\.com|store\.example)(\/|$)/.test(sl.value)) v.push("I6");
      if (sl.type !== "url" && /[^A-Za-z0-9_-]/.test(sl.value) && !/^\d{4}-\d{2}-\d{2}$/.test(sl.value)) v.push("I6");
    }
  }
  if (a.type === "SubmitEvidence" && a.exhibitIds.some((id) => id !== "EX-OK")) v.push("I8");
  if (s.executed.has(actionKey(a))) v.push("I9");
  if (a.type === "AcceptClaim" && a.amountCents > p.autoAcceptMaxCents) v.push("I7");
  if (money && s.buyerDisputes60d >= p.repeatDisputerThreshold) v.push("I10");
  return v;
}

describe("firewall invariants (property)", () => {
  it("never ALLOWs an action that violates any invariant, and never blocks a clean one", () => {
    fc.assert(
      fc.property(actionArb, snapshotArb, policyArb, (a, s, p) => {
        const d = gate(a, s, p, NOW);
        const v = violations(a, s, p);
        if (d.kind === "ALLOW") expect(v).toEqual([]);
        else expect(v.length).toBeGreaterThan(0);
        // approval-only rules: REQUIRE_APPROVAL exactly when every violation is I7/I10
        const onlyApproval = v.length > 0 && v.every((x) => x === "I7" || x === "I10");
        expect(d.kind === "REQUIRE_APPROVAL").toBe(onlyApproval);
      }),
      { numRuns: 5000, seed: 42 },
    );
  });

  it("approval never overrides a DENY", () => {
    fc.assert(
      fc.property(actionArb, snapshotArb, policyArb, (a, s, p) => {
        const plain = gate(a, s, p, NOW);
        const approved = gate(a, s, p, NOW, { approved: true });
        if (plain.kind === "DENY") expect(approved.kind).toBe("DENY");
        else expect(approved.kind).toBe("ALLOW");
      }),
      { numRuns: 2000, seed: 7 },
    );
  });

  it("is deterministic", () => {
    fc.assert(
      fc.property(actionArb, snapshotArb, policyArb, (a, s, p) => {
        expect(gate(a, s, p, NOW)).toEqual(gate(a, s, p, NOW));
      }),
      { numRuns: 500, seed: 1 },
    );
  });

  it("sequences of ALLOWed money actions never break I1, I4 or I9", () => {
    fc.assert(
      fc.property(snapshotArb, policyArb, fc.array(actionArb, { maxLength: 20 }), (s0, p, actions) => {
        const executed = new Set<string>();
        let s: Snapshot = { ...s0, executed };
        for (const a of actions) {
          const d = gate(a, s, p, NOW, { approved: true });
          if (d.kind !== "ALLOW") continue;
          const key = actionKey(a);
          expect(executed.has(key)).toBe(false);
          executed.add(key);
          const m = moneyCents(a);
          s = { ...s, pendingRefundCents: s.pendingRefundCents + m, refundsTodayCents: s.refundsTodayCents + m,
            refundsToBuyer30dCents: s.refundsToBuyer30dCents + m };
          expect(s.refundedCents + s.pendingRefundCents).toBeLessThanOrEqual(s.capture.amountCents);
          expect(s.refundsTodayCents - s0.refundsTodayCents).toBeLessThanOrEqual(Math.max(0, p.dailyRefundBudgetCents - s0.refundsTodayCents));
          expect(s.refundsToBuyer30dCents - s0.refundsToBuyer30dCents).toBeLessThanOrEqual(Math.max(0, p.perBuyerCap30dCents - s0.refundsToBuyer30dCents));
        }
      }),
      { numRuns: 1000, seed: 3 },
    );
  });
});

describe("firewall boundaries", () => {
  const base: Snapshot = {
    dispute: { id: "PP-D-1", status: "WAITING_FOR_SELLER_RESPONSE", links: ["make_offer", "accept_claim", "provide_evidence"],
      sellerResponseDueMs: NOW + DAY, amountCents: 1000, currency: "USD", orderId: "ORDER-1" },
    capture: { amountCents: 1000, currency: "USD" },
    refundedCents: 200, pendingRefundCents: 0, refundsTodayCents: 0, refundsToBuyer30dCents: 0, buyerDisputes60d: 1,
    executed: new Set(), evidenceStore: new Map(), exhibitBytesSha256: new Map(),
  };
  const P = DEFAULT_POLICY;
  const claim = (amountCents: number) => ({ type: "AcceptClaim", disputeId: "PP-D-1", amountCents, currency: "USD" });

  it("I1: exactly the refundable amount is allowed, one cent more is denied", () => {
    expect(gate(claim(800), base, P, NOW).kind).toBe("ALLOW");
    expect(gate(claim(801), base, P, NOW)).toMatchObject({ kind: "DENY", reason: "I1_EXCEEDS_REFUNDABLE" });
  });

  it("I1: pending refunds count against the refundable amount", () => {
    const s = { ...base, pendingRefundCents: 300 };
    expect(gate(claim(500), s, P, NOW).kind).toBe("ALLOW");
    expect(gate(claim(501), s, P, NOW)).toMatchObject({ kind: "DENY", reason: "I1_EXCEEDS_REFUNDABLE" });
  });

  it("I2: one ms before the deadline is allowed, at the deadline is denied", () => {
    expect(gate(claim(100), base, P, NOW + DAY - 1).kind).toBe("ALLOW");
    expect(gate(claim(100), base, P, NOW + DAY)).toMatchObject({ kind: "DENY", reason: "I2_PAST_DEADLINE" });
  });

  it("I3: offer exactly at the cap is allowed, one cent over is denied", () => {
    const offer = (amountCents: number) => ({ type: "MakeOffer", disputeId: "PP-D-1", amountCents, currency: "USD", offerType: "REFUND" });
    expect(gate(offer(500), base, P, NOW).kind).toBe("ALLOW");
    expect(gate(offer(501), base, P, NOW)).toMatchObject({ kind: "DENY", reason: "I3_OFFER_OVER_CAP" });
  });

  it("hero 3: 'refund $500' on a $10 order is denied by I1", () => {
    expect(gate(claim(50_000), base, P, NOW)).toMatchObject({ kind: "DENY", reason: "I1_EXCEEDS_REFUNDABLE" });
  });

  it("fails closed on malformed proposals and snapshots", () => {
    expect(gate({ type: "Wire", amountCents: 1 }, base, P, NOW)).toMatchObject({ kind: "DENY", reason: "INVALID_PROPOSAL" });
    expect(gate(claim(1), { ...base, refundedCents: Number.NaN }, P, NOW)).toMatchObject({ kind: "DENY", reason: "SNAPSHOT_INCOMPLETE" });
  });
});
