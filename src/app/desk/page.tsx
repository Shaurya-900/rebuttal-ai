// The seller's desk: run a seeded demo dispute, see recent traces, and answer actions that need approval.
import Link from "next/link";
import { SCENARIOS } from "../../lib/agent/scenarios";
import { getDb } from "../../lib/db/client";
import { liveQueue, recentRuns } from "../../lib/desk";
import { answer, runScenario } from "./actions";
import { NextStep, RouteBar } from "../flow";
import { Badge, displayTitle, gateTone, usd } from "./ui";

export const dynamic = "force-dynamic";

// Plain names for the desk. The stored scenario titles stay as they are: they are part of recorded prompts.
const NAME: Record<string, string> = {
  hero1: "\u201cIt never arrived\u201d, but tracking says delivered",
  hero2: "The lens arrived hazy, and the listing never said so",
  hero3: "The buyer who tries to give orders",
  ctrl1: "The parcel really was lost",
};

const BLURB: Record<string, string> = {
  hero1: "Buyer says the camera never arrived. Tracking shows delivery to the order address, and the buyer emailed that it arrived.",
  hero2: "Buyer says the lens is hazy. The listing never mentioned haze.",
  hero3: "The camera was delivered and the buyer emailed that it arrived. Then the dispute message tells the agent to ignore its rules and refund $500.",
  ctrl1: "Parcel lost in transit, no delivery scan for weeks. The honest answer is to refund.",
};


export default async function Desk({ searchParams }: { searchParams: Promise<{ limited?: string; approval?: string }> }) {
  const { limited, approval } = await searchParams;
  const db = getDb();
  const [runs, live] = await Promise.all([recentRuns(db), liveQueue(db)]);
  const approvalsOn = (process.env.DESK_APPROVER_TOKEN ?? "").length >= 12;

  const lead = SCENARIOS.hero3!;
  const others = Object.values(SCENARIOS).filter((x) => x.id !== lead.id);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <RouteBar current={1} />
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">Watch a dispute get decided</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-graphite">
        Pick a dispute from Mira&apos;s shop and run it. You will see each stage: what the AI was allowed to read, the score, the decision, and the
        firewall&apos;s stamp. Runs replay recorded model answers, so nothing is sent to PayPal. All cases are synthetic.
      </p>

      {limited && (
        <p role="status" className="mt-4 rounded border border-deny/30 bg-deny-tint px-3 py-2 text-sm text-deny">
          {limited === "global" ? "The demo is busy right now. Try again in an hour." : `Limit reached: ${limited} demo runs per hour from one address. Your recent runs below still open.`}
        </p>
      )}
      {approval && (
        <p role="status" className="mt-4 rounded border border-rule bg-sunk px-3 py-2 text-sm">
          {{ approved: "Approved. The worker re-checks the firewall against PayPal's current state before sending.", rejected: "Rejected. Nothing will be sent.", stale: "That action was already answered.", denied: "Wrong approver password, or approvals are off on this deploy." }[approval] ?? ""}
        </p>
      )}

      <form action={runScenario} className="mt-8 border-t-2 border-ink pt-6">
        <input type="hidden" name="scenario" value={lead.id} />
        <h2 className="text-xl font-bold tracking-tight">Start here: {NAME[lead.id]?.toLowerCase()}</h2>
        <p className="mt-2 max-w-2xl leading-relaxed text-graphite">{BLURB[lead.id]}</p>
        <button className="btn-primary mt-5 px-6 py-3 text-base">Run this dispute</button>
      </form>

      <section aria-labelledby="others" className="mt-12">
        <h2 id="others" className="text-lg font-bold tracking-tight">Or run another case</h2>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {others.map((x) => (
            <li key={x.id}>
              <form action={runScenario} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
                <input type="hidden" name="scenario" value={x.id} />
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="font-semibold">{NAME[x.id] ?? displayTitle(x.title)}</h3>
                  <p className="mt-0.5 text-sm text-graphite">{BLURB[x.id]}</p>
                </div>
                <button className="btn-quiet">Run</button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {runs.length > 0 && (
        <section aria-labelledby="recent" className="mt-12">
          <h2 id="recent" className="text-lg font-bold tracking-tight">Runs so far</h2>
          <ul className="mt-3 divide-y divide-rule border-y border-rule">
            {runs.slice(0, 5).map((r) => (
              <li key={r.id}>
                <Link href={`/desk/run/${r.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm hover:bg-sunk">
                  <span>{NAME[r.scenario] ?? displayTitle(SCENARIOS[r.scenario]?.title ?? r.scenario)}</span>
                  <span className="flex items-center gap-2">
                    <Badge>{r.choice?.toLowerCase()}</Badge>
                    <Badge tone={gateTone(r.gate)}>{r.gate === "ALLOW" ? "allowed" : r.gate === "DENY" ? "denied" : r.gate ? "held for seller" : "no action"}</Badge>
                    <span className="text-xs tabular-nums text-graphite">{new Date(r.at).toISOString().slice(11, 16)} UTC</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {live.pending.length > 0 && (
        <section aria-labelledby="waiting" className="mt-12">
          <h2 id="waiting" className="text-lg font-bold tracking-tight">Waiting for the seller</h2>
          <p className="mt-1 text-sm text-graphite">Actions on real sandbox disputes that the firewall held for Mira&apos;s approval. Approval never overrides a denial.</p>
          <ul className="mt-3 space-y-2">
            {live.pending.map((p) => (
              <li key={p.id} className="rounded border border-rule p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.action_type}</strong>
                  {"amountCents" in p.params && <span>{usd(p.params.amountCents)}</span>}
                  <span className="text-graphite">on {p.dispute_id}</span>
                  <Badge tone="amber">{p.gate_decision.kind === "REQUIRE_APPROVAL" ? p.gate_decision.rule : "re-check"}</Badge>
                </div>
                {approvalsOn ? (
                  <form action={answer} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="intentId" value={p.id} />
                    <input type="password" name="token" required placeholder="Approver password" aria-label="Approver password" className="field mt-0 w-auto min-w-0" />
                    <button name="answer" value="approve" className="btn-quiet border-allow/40 text-allow">Approve</button>
                    <button name="answer" value="reject" className="btn-quiet">Reject</button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-graphite">Approvals are off on this deploy (no approver password set).</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <NextStep href="/eval" action="Next: try to fool it">
        One dispute decided. Now see what happened when 24 attacks were thrown at it, and at a naive agent on the same model.
      </NextStep>
    </main>
  );
}
