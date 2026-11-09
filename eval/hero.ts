// Run a seeded hero scenario offline and print the trace.
//   npm run hero -- hero1            replay from fixtures/llm-cache (default, no key, no network)
//   npm run hero -- all --stub       (re)write stand-in cassettes from eval/stub-llm.ts
//   REBUTTAL_LLM_MODE=record npm run hero -- all    record real model answers (needs REBUTTAL_LLM_KEY)
import { mkdirSync, writeFileSync } from "node:fs";
import { runDispute } from "../src/lib/agent/run";
import { DEMO_NOW_MS, SCENARIOS } from "../src/lib/agent/scenarios";
import { gate } from "../src/lib/firewall/gate";
import { DEFAULT_POLICY } from "../src/lib/firewall/types";
import { createLlm, LLM_CACHE_DIR, llmFromEnv } from "../src/lib/llm";
import { runBaseline, toProposal } from "./baseline";
import { stubProvider } from "./stub-llm";
import { snapshotFor } from "../src/lib/agent/run";

const args = process.argv.slice(2);
const stub = args.includes("--stub");
const which = args.find((a) => !a.startsWith("--")) ?? "all";
const ids = which === "all" ? Object.keys(SCENARIOS) : [which];
const llm = stub ? createLlm({ mode: "record", providers: [stubProvider], cacheDir: LLM_CACHE_DIR }) : llmFromEnv();
const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

for (const id of ids) {
  const s = SCENARIOS[id];
  if (!s) throw new Error(`unknown scenario ${id}; known: ${Object.keys(SCENARIOS).join(", ")}`);
  const callsBefore = llm.calls.length;
  const t = await runDispute(s, llm, DEMO_NOW_MS);
  console.log(`\n=== ${s.title}  [SYNTHETIC]  dispute ${s.dispute.id}, ${usd(s.dispute.amountCents)}`);
  console.log("1. Quarantine (buyer text -> fields; planner never sees the text):");
  for (const [mid, f] of Object.entries(t.quarantine)) console.log(`   ${mid}: ${JSON.stringify(f)}`);
  console.log("2. Rubric (code-verified citations):");
  for (const it of t.rubric.items) console.log(`   ${it.itemId} ${String(it.awarded).padStart(2)}/${it.weight}  ${it.awarded ? `[${it.sourceId}]` : it.why}`);
  if (t.rubric.citationFailures.length) console.log(`   rejected citations: ${JSON.stringify(t.rubric.citationFailures)}`);
  console.log(`   score ${t.rubric.score}${t.rubric.capped ? " (capped: no delivery, stale tracking)" : ""}`);
  const el = Object.entries(t.decision.expectedLossCents).map(([k, v]) => `${k} ${usd(v)}`).join(", ");
  console.log(`3. Decision: ${t.decision.choice}  (p=${t.decision.p}, q=${t.decision.q}; expected loss ${el})`);
  console.log(`4. Proposal: ${JSON.stringify(t.proposal)}`);
  console.log(`5. Firewall: ${t.gate?.kind}${t.gate && t.gate.kind !== "ALLOW" ? ` (${"reason" in t.gate ? t.gate.reason : t.gate.rule})` : ""}`);
  if (t.packet && t.packetBytes) {
    mkdirSync("out", { recursive: true });
    writeFileSync(`out/${s.id}-packet.pdf`, t.packetBytes);
    console.log(`   packet out/${s.id}-packet.pdf sha256 ${t.packet.sha256.slice(0, 16)}…`);
  }
  if (id === "hero3") {
    const b = await runBaseline(llm, s);
    const p = toProposal(b, s);
    const g = gate(p, snapshotFor(s), DEFAULT_POLICY, DEMO_NOW_MS);
    console.log(`6. Naive baseline on the same dispute proposes ${JSON.stringify(p)}`);
    console.log(`   Rebuttal's firewall on that proposal: ${g.kind}${g.kind === "DENY" ? ` (${g.reason}; all fired: ${g.fired.map((f) => f.rule).join(", ")})` : ""}`);
  }
  const sources = [...new Set(llm.calls.slice(callsBefore).map((c) => c.recordedFrom))];
  console.log(`LLM answers from: ${sources.join(", ")}${sources.some((x) => x.startsWith("stub")) ? "  <- HAND-WRITTEN STAND-INS, not model output" : ""}`);
}
