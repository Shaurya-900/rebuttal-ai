// Rows for the AG Studio dashboard (/dashboard). Every row comes from real stored data:
//   runs    every agent run in the append-only event log (judge clicks on /desk included)
//   attacks the committed adversarial eval report (eval/results/report.json), one row per case and agent
//   live    the real PayPal sandbox disputes, read-only (src/lib/live.ts)
// Scenario data is synthetic and labelled so on the page; PayPal state on the live rows is real.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { SCENARIOS } from "./agent/scenarios";
import type { StoredRun } from "./desk";
import type { Db } from "./exec/intents";
import { moneyCents } from "./firewall/gate";
import type { Decision, Policy } from "./firewall/types";
import { liveRecommendations } from "./live";

export type RunRow = {
  id: string; at: string; scenario: string; reason: string; score: number; decision: string;
  action: string; amount: number; verdict: string; rule: string; naiveVerdict: string; count: 1;
};
export type AttackRow = { id: string; caseTitle: string; attackClass: string; className: string; rightAnswer: string; naiveMeasured: string; naiveTried: number; naiveThrough: number; rebuttalTried: number; rebuttalThrough: number };
export type LiveRow = { id: string; reason: string; status: string; stage: string; amount: number; recommendation: string; verdict: string; allowedActions: number; count: 1 };
export type DashboardData = { asOf: string; runs: RunRow[]; attacks: AttackRow[]; live: LiveRow[]; liveError: string | null };

const verdict = (g: Decision | null | undefined) =>
  !g ? "No action" : g.kind === "ALLOW" ? "Allowed" : g.kind === "DENY" ? "Denied" : "Held for seller";
const ruleOf = (g: Decision | null | undefined) => (!g ? "" : g.kind === "DENY" ? g.reason : g.kind === "REQUIRE_APPROVAL" ? g.rule : "");
const ACTION: Record<string, string> = { SubmitEvidence: "Send evidence", MakeOffer: "Offer", AcceptClaim: "Accept", IssueRefund: "Refund", SendMessage: "Message" };
const REASON: Record<string, string> = { INR: "Not received", SNAD: "Not as described", MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Not received", MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described" };
const CLASS_NAMES: Record<string, string> = {
  A1: "Direct injection", A2: "Indirect injection", A3: "Forged claim", A4: "Tampered exhibit",
  A5: "Amount manipulation", A6: "Duplicate or replay", A7: "Deadline games", A8: "Poisoned listing", BENIGN: "Honest case",
};

async function runRows(db: Db): Promise<RunRow[]> {
  // ponytail: last 500 runs is plenty for a demo dashboard; page through event_log if judges ever click more.
  const r = await db.execute(sql`select id, at, data from event_log where kind = 'agent_trace' order by id desc limit 500`);
  return (r as unknown as { rows: { id: number; at: Date | string; data: StoredRun }[] }).rows.map(({ id, at, data }) => ({
    id: String(id),
    at: new Date(at).toISOString(),
    scenario: (SCENARIOS[data.scenarioId]?.title ?? data.scenarioId).replace(" · ", ": "),
    reason: REASON[data.rubric.reason] ?? data.rubric.reason,
    score: data.rubric.score,
    decision: data.decision.choice.charAt(0) + data.decision.choice.slice(1).toLowerCase(),
    action: data.proposal ? ACTION[data.proposal.type] ?? data.proposal.type : "None",
    amount: data.proposal ? moneyCents(data.proposal) / 100 : 0,
    verdict: verdict(data.gate),
    rule: ruleOf(data.gate),
    naiveVerdict: data.baseline ? `${ACTION[data.baseline.proposal.type] ?? data.baseline.proposal.type}: ${verdict(data.baseline.gate).toLowerCase()}` : "",
    count: 1 as const,
  }));
}

type ReportCase = { id: string; cls: string; title: string; truth: string; rebuttal: { success: boolean; runs: unknown[] }; baseline: { success: boolean; runs: unknown[] } | null };
function attackRows(): AttackRow[] {
  try {
    const rep = JSON.parse(readFileSync(join(process.cwd(), "eval", "results", "report.json"), "utf8")) as { cases: ReportCase[] };
    // One row per case, one column pair per agent, so a total can never blend the two agents.
    return rep.cases.map((c) => {
      const attack = c.cls !== "BENIGN";
      return {
        id: c.id, caseTitle: c.title.replace(" · ", ": "), attackClass: attack ? c.cls : "Honest", className: CLASS_NAMES[c.cls] ?? c.cls,
        rightAnswer: c.truth === "NONE" ? "No action" : c.truth.toLowerCase(),
        naiveMeasured: !attack ? "Honest case" : c.baseline ? "Measured" : "Not measured",
        naiveTried: attack && c.baseline ? 1 : 0, naiveThrough: attack && c.baseline?.success ? 1 : 0,
        rebuttalTried: attack ? 1 : 0, rebuttalThrough: attack && c.rebuttal.success ? 1 : 0,
      };
    });
  } catch {
    return [];
  }
}

export async function dashboardData(db: Db, policy: Policy): Promise<DashboardData> {
  const [runs, live] = await Promise.all([runRows(db), liveRecommendations(policy)]);
  return {
    asOf: new Date().toISOString(),
    runs,
    attacks: attackRows(),
    live: live.ok
      ? live.items.map((x) => ({
          id: x.id, reason: REASON[x.reason] ?? x.reason, status: x.status.replaceAll("_", " ").toLowerCase(), stage: (x.stage ?? "").toLowerCase(),
          amount: x.amountCents / 100, recommendation: x.waitingOn ? "Wait" : x.proposal ? ACTION[x.proposal.type] ?? x.proposal.type : "None",
          verdict: x.waitingOn ? "Waiting" : verdict(x.gate), allowedActions: x.links.filter((l) => l !== "self").length, count: 1 as const,
        }))
      : [],
    liveError: live.ok ? null : live.error,
  };
}
