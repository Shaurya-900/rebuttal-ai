// /desk data: run a seeded scenario for a judge, store the trace, read the queue back.
// Seeded runs replay recorded LLM answers (fixtures/llm-cache), so a judge click costs no LLM call and nothing is sent
// to PayPal: the trace shows what the firewall decided, and only the worker's executor ever acts.
import { sql } from "drizzle-orm";
import { runBaseline, toProposal } from "../../eval/baseline";
import { runDispute, snapshotFor, type Trace } from "./agent/run";
import { DEMO_NOW_MS, SCENARIOS } from "./agent/scenarios";
import { gate } from "./firewall/gate";
import type { Decision, Policy, ProposedAction } from "./firewall/types";
import type { Db } from "./exec/intents";
import { bump, dailyLlmCap, HOUR, ipBucket } from "./limits";
import { llmFromEnv, type Llm } from "./llm";
import { currentPolicy } from "./policy";

export type StoredRun = Trace & {
  baseline?: { proposal: ProposedAction; gate: Decision; reasoning: string };
  policy?: Policy; // the seller policy this run was decided under (absent on runs stored before Nov 10)
};

export type RunResult = { kind: "ok"; runId: number } | { kind: "rate_limited"; limit: number };

export async function runDemo(
  db: Db,
  scenarioId: string,
  ip: string,
  opts: { perIpPerHour: number; dailyLlmCap: number; llm?: Llm; nowMs?: number },
): Promise<RunResult> {
  const s = SCENARIOS[scenarioId];
  if (!s) throw new Error(`unknown scenario ${scenarioId}`);
  if (!(await bump(db, ipBucket(ip), HOUR, opts.perIpPerHour, opts.nowMs)).ok) return { kind: "rate_limited", limit: opts.perIpPerHour };

  const llm = opts.llm ?? llmFromEnv(process.env, dailyLlmCap(db, opts.dailyLlmCap));
  const start = llm.calls.length;
  const { policy } = await currentPolicy(db);
  const { packetBytes: _bytes, ...trace } = await runDispute(s, llm, DEMO_NOW_MS, policy);
  const run: StoredRun = { ...trace, policy };
  // When the buyer's text tried to instruct the agent, also show what a naive agent (raw text, no gate) would do.
  if (Object.values(trace.quarantine).some((q) => q.containsInstructions)) {
    const b = await runBaseline(llm, s);
    const proposal = toProposal(b, s);
    run.baseline = { proposal, gate: gate(proposal, snapshotFor(s), policy, DEMO_NOW_MS), reasoning: b.reasoning };
  }
  run.llmCalls = llm.calls.slice(start);
  const r = await db.execute(sql`insert into event_log (dispute_id, kind, data) values (${s.dispute.id}, 'agent_trace', ${JSON.stringify(run)}::jsonb) returning id`);
  return { kind: "ok", runId: Number((r as unknown as { rows: { id: number }[] }).rows[0]!.id) };
}

export async function getRun(db: Db, id: number): Promise<{ id: number; at: string; run: StoredRun } | null> {
  const r = await db.execute(sql`select id, at, data from event_log where id = ${id} and kind = 'agent_trace'`);
  const row = (r as unknown as { rows: { id: number; at: Date | string; data: StoredRun }[] }).rows[0];
  return row ? { id: Number(row.id), at: new Date(row.at).toISOString(), run: row.data } : null;
}

export async function recentRuns(db: Db, n = 8) {
  const r = await db.execute(sql`select id, at, data->>'scenarioId' as scenario, data->'decision'->>'choice' as choice, data->'gate'->>'kind' as gate
    from event_log where kind = 'agent_trace' order by id desc limit ${n}`);
  return (r as unknown as { rows: { id: number; at: Date | string; scenario: string; choice: string; gate: string | null }[] }).rows;
}

/** Real sandbox disputes the worker has synced, and the actions waiting for the seller's approval. */
export async function liveQueue(db: Db) {
  const d = await db.execute(sql`select id, reason, status, stage, amount_cents, currency, seller_response_due_at, raw->'links' as links
    from dispute where id not like 'SYN-%' order by updated_at desc limit 20`);
  const p = await db.execute(sql`select id, dispute_id, action_type, params, gate_decision, created_at from action_intent where status = 'PROPOSED' order by id`);
  type D = { id: string; reason: string; status: string; stage: string | null; amount_cents: number; currency: string; seller_response_due_at: Date | null; links: { rel: string }[] | null };
  type P = { id: number; dispute_id: string; action_type: string; params: ProposedAction; gate_decision: Decision; created_at: Date };
  return { disputes: (d as unknown as { rows: D[] }).rows, pending: (p as unknown as { rows: P[] }).rows };
}
