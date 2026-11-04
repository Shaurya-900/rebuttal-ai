import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DEFAULT_POLICY } from "../firewall/types";
import { decide } from "./decide";
import { QuarantineFields } from "./quarantine";
import { ITEM_IDS, scoreRubric, type Citation } from "./rubric";
import { CONTROL_INR_LOST, DEMO_NOW_MS, HERO1, HERO2, type Scenario } from "./scenarios";

const q = (f: Partial<QuarantineFields>): QuarantineFields => QuarantineFields.parse({
  claimType: "NONE", itemReceived: "UNCLEAR", defect: "NONE", buyerEvidence: "NONE",
  requestedRemedy: "NONE", mentionsAmountCents: null, containsInstructions: false, ...f,
});
const score = (s: Scenario, quarantine: Record<string, QuarantineFields>, citations: Citation[]) =>
  scoreRubric({ scenario: s, quarantine, citations, nowMs: DEMO_NOW_MS });

const hero1Q = { "msg:hero1:0": q({ itemReceived: "YES" }), "msg:hero1:1": q({ itemReceived: "NO", claimType: "NOT_RECEIVED" }) };
const hero1Cites: Citation[] = [
  { itemId: "R1", sourceId: "trk:hero1:3" }, { itemId: "R2", sourceId: "trk:hero1:3" }, { itemId: "R4", sourceId: "msg:hero1:0" },
  { itemId: "R5", sourceId: "order:ORD-hero1" }, { itemId: "R6", sourceId: "paypal-tracking:ORD-hero1" }, { itemId: "R7", sourceId: "tracking:SYNHERO101" },
];

describe("rubric worked examples (docs/rubric.md)", () => {
  it("hero 1: INR strong -> 85 -> FIGHT", () => {
    const r = score(HERO1, hero1Q, hero1Cites);
    expect(r.score).toBe(85);
    expect(r.citationFailures).toEqual([]);
    expect(decide({ score: r.score, reason: "INR", delivered: true, amountCents: 1000, links: HERO1.dispute.links, policy: DEFAULT_POLICY }))
      .toMatchObject({ choice: "FIGHT", expectedLossCents: { FIGHT: 200, OFFER: 260, ACCEPT: 1000 } });
  });

  it("hero 2: SNAD weak -> 10 -> OFFER 30% ($3)", () => {
    const r = score(HERO2, { "msg:hero2:0": q({ defect: "LENS_HAZE", buyerEvidence: "PHOTO" }) }, [{ itemId: "S6", sourceId: "trk:hero2:1" }]);
    expect(r.score).toBe(10);
    expect(decide({ score: 10, reason: "SNAD", delivered: true, amountCents: 1000, links: HERO2.dispute.links, policy: DEFAULT_POLICY }))
      .toMatchObject({ choice: "OFFER", offerCents: 300, expectedLossCents: { FIGHT: 1800, OFFER: 900, ACCEPT: 1000 } });
  });

  it("genuine non-delivery -> ACCEPT (q = 0 without DELIVERED)", () => {
    const d = decide({ score: 20, reason: "INR", delivered: false, amountCents: 1000, links: CONTROL_INR_LOST.dispute.links, policy: DEFAULT_POLICY });
    expect(d).toMatchObject({ choice: "ACCEPT", q: 0 });
  });

  it("an option whose PayPal link is missing is never chosen", () => {
    const d = decide({ score: 85, reason: "INR", delivered: true, amountCents: 1000, links: ["self", "make_offer"], policy: DEFAULT_POLICY });
    expect(d.choice).toBe("OFFER");
    expect(d.removed).toEqual(["FIGHT", "ACCEPT"]);
    expect(decide({ score: 85, reason: "INR", delivered: true, amountCents: 1000, links: ["self"], policy: DEFAULT_POLICY }).choice).toBe("WAIT");
  });
});

describe("no citation, no points", () => {
  it("rejects citations that point at the wrong record", () => {
    const r = score(HERO1, hero1Q, [
      { itemId: "R1", sourceId: "trk:hero1:2" }, // OUT_FOR_DELIVERY, not DELIVERED
      { itemId: "R3", sourceId: "trk:hero1:3" }, // no proof on the event
      { itemId: "R4", sourceId: "msg:hero1:1" }, // buyer says NOT received
      { itemId: "R6", sourceId: "order:ORD-hero1" }, // wrong record type
      { itemId: "S1", sourceId: "listing:L-hero1:0" }, // SNAD item on an INR dispute
    ]);
    expect(r.score).toBe(0);
    expect(r.citationFailures).toHaveLength(5);
  });

  it("a listing that does not mention the defect cannot earn S1", () => {
    const r = score(HERO2, { "msg:hero2:0": q({ defect: "LENS_HAZE" }) }, [{ itemId: "S1", sourceId: "listing:L-hero2:1" }]);
    expect(r.items.find((i) => i.itemId === "S1")!.awarded).toBe(0);
  });

  it("a listing that does mention it can", () => {
    const disclosed: Scenario = { ...HERO2, listing: { ...HERO2.listing, chunks: [{ id: "listing:L-hero2:9", text: "Light internal haze, does not affect photos." }] } };
    const r = score(disclosed, { "msg:hero2:0": q({ defect: "LENS_HAZE" }) }, [{ itemId: "S1", sourceId: "listing:L-hero2:9" }]);
    expect(r.items.find((i) => i.itemId === "S1")!.awarded).toBe(30);
  });

  it("caps INR at 20 with no delivery and tracking older than 14 days", () => {
    const r = score(CONTROL_INR_LOST, {}, [
      { itemId: "R5", sourceId: "order:ORD-ctrl1" }, { itemId: "R6", sourceId: "paypal-tracking:ORD-ctrl1" },
      { itemId: "R7", sourceId: "tracking:SYNCTRL101" },
    ]);
    expect(r.score).toBeLessThanOrEqual(20);
  });

  it("property: random citations never score more than the true citations, and every point has a source", () => {
    const max = score(HERO1, hero1Q, hero1Cites).score;
    const ids = ["trk:hero1:0", "trk:hero1:3", "msg:hero1:0", "msg:hero1:1", "order:ORD-hero1", "order:ORD-other",
      "paypal-tracking:ORD-hero1", "tracking:SYNHERO101", "listing:L-hero1:0", "made-up"];
    fc.assert(fc.property(
      fc.array(fc.record({ itemId: fc.constantFrom(...ITEM_IDS), sourceId: fc.constantFrom(...ids) }), { maxLength: 30 }),
      (cites) => {
        const r = score(HERO1, hero1Q, cites);
        expect(r.score).toBeLessThanOrEqual(max);
        for (const it of r.items) if (it.awarded) expect(cites.some((c) => c.itemId === it.itemId && c.sourceId === it.sourceId)).toBe(true);
      },
    ), { numRuns: 500 });
  });
});
