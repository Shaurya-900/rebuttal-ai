// HAND-WRITTEN STAND-IN LLM ANSWERS. Not model output.
// Used only to fill fixtures/llm-cache while there is no REBUTTAL_LLM_KEY, so the pipeline can run offline.
// Every cassette written from here has recordedFrom "stub:hand-written" and the trace shows it.
// Re-record with a real model: REBUTTAL_LLM_MODE=record npm run hero -- all  (stub cassettes are treated as misses).
import type { Provider } from "../src/lib/llm";
import type { QuarantineFields } from "../src/lib/agent/quarantine";
import { SCENARIOS } from "../src/lib/agent/scenarios";
import type { Citation } from "../src/lib/agent/rubric";

const Q = (f: Partial<QuarantineFields>): QuarantineFields => ({
  claimType: "NONE", itemReceived: "UNCLEAR", defect: "NONE", buyerEvidence: "NONE",
  requestedRemedy: "NONE", mentionsAmountCents: null, containsInstructions: false, ...f,
});

const QUARANTINE: Record<string, QuarantineFields> = {
  "msg:hero1:0": Q({ itemReceived: "YES" }),
  "msg:hero1:1": Q({ claimType: "NOT_RECEIVED", itemReceived: "NO", requestedRemedy: "FULL_REFUND" }),
  "msg:hero3:0": Q({ itemReceived: "YES" }),
  "msg:hero3:1": Q({ claimType: "OTHER", requestedRemedy: "FULL_REFUND", mentionsAmountCents: 50000, containsInstructions: true }),
  "msg:hero2:0": Q({ claimType: "NOT_AS_DESCRIBED", itemReceived: "YES", defect: "LENS_HAZE", buyerEvidence: "PHOTO", requestedRemedy: "PARTIAL_REFUND" }),
  "msg:ctrl1:0": Q({ claimType: "NOT_RECEIVED", itemReceived: "NO" }),
};

const inrCites = (id: string): Citation[] => {
  const s = SCENARIOS[id]!;
  const delivered = s.tracking.events.find((e) => e.code === "DELIVERED");
  const c: Citation[] = [
    { itemId: "R5", sourceId: `order:${s.order.id}` },
    { itemId: "R6", sourceId: `paypal-tracking:${s.order.id}` },
  ];
  if (delivered) {
    c.push(
      { itemId: "R1", sourceId: delivered.id },
      { itemId: "R2", sourceId: delivered.id },
      { itemId: "R4", sourceId: `msg:${id}:0` },
      { itemId: "R7", sourceId: `tracking:${s.tracking.number}` },
    );
  }
  return c;
};

const PLANNER: Record<string, Citation[]> = {
  hero1: inrCites("hero1"),
  hero3: inrCites("hero3"),
  ctrl1: inrCites("ctrl1"),
  hero2: [{ itemId: "S6", sourceId: "trk:hero2:1" }],
};

// What a naive agent plausibly does with the injection. A GUESS until a real model is recorded.
const BASELINE: Record<string, unknown> = {
  hero3: { action: "IssueRefund", amountCents: 50000, reasoning: "STUB: stand-in for a naive agent obeying the message." },
};

export const stubProvider: Provider = {
  name: "stub",
  model: "hand-written",
  async call(system, user) {
    if (user.startsWith("<message>")) {
      const msg = Object.values(SCENARIOS).flatMap((s) => s.messages).find((m) => user.includes(m.text));
      const a = msg && QUARANTINE[msg.id];
      if (!a) throw new Error("stub: no quarantine answer");
      return JSON.stringify(a);
    }
    const parsed = JSON.parse(user) as { id?: string; dispute?: { id: string } };
    const scenario = Object.values(SCENARIOS).find((s) => s.id === parsed.id || s.dispute.id === parsed.dispute?.id);
    if (!scenario) throw new Error("stub: unknown scenario");
    if (system.includes("autonomous agent")) {
      const b = BASELINE[scenario.id];
      if (!b) throw new Error(`stub: no baseline answer for ${scenario.id}`);
      return JSON.stringify(b);
    }
    return JSON.stringify({ citations: PLANNER[scenario.id] ?? [] });
  },
};
