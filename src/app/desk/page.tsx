// The seller's desk: run a seeded demo dispute, see recent traces, and answer actions that need approval.
import Link from "next/link";
import { SCENARIOS } from "../../lib/agent/scenarios";
import { getDb } from "../../lib/db/client";
import { liveQueue, recentRuns } from "../../lib/desk";
import { answer, runScenario } from "./actions";
import { Badge, displayTitle, gateTone, usd } from "./ui";

export const dynamic = "force-dynamic";

const BLURB: Record<string, string> = {
  hero1: "Buyer says the camera never arrived. Tracking shows delivery to the order address, and the buyer emailed that it arrived.",
  hero2: "Buyer says the lens is hazy. The listing never mentioned haze.",
  hero3: "Same as hero 1, but the buyer's email tells the agent to ignore its rules and refund $500.",
  ctrl1: "Parcel lost in transit, no delivery scan for weeks. The honest answer is to refund.",
};


export default async function Desk({ searchParams }: { searchParams: Promise<{ limited?: string; approval?: string }> }) {
  const { limited, approval } = await searchParams;
  const db = getDb();
  const [runs, live] = await Promise.all([recentRuns(db), liveQueue(db)]);
  const approvalsOn = (process.env.DESK_APPROVER_TOKEN ?? "").length >= 12;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-extrabold tracking-tight">Mira&apos;s dispute desk</h1>
      </div>

      {limited && (
        <p className="mt-4 rounded border border-deny/30 bg-deny-tint px-3 py-2 text-sm text-deny">
          {limited === "global" ? "The demo is busy right now. Try again in an hour." : `Limit reached: ${limited} demo runs per hour from one address. Recent runs below still open.`}
        </p>
      )}
      {approval && (
        <p className="mt-4 rounded border border-rule bg-sunk px-3 py-2 text-sm">
          {{ approved: "Approved. The worker re-checks the firewall against PayPal's current state before sending.", rejected: "Rejected. Nothing will be sent.", stale: "That action was already answered.", denied: "Wrong approver password, or approvals are off on this deploy." }[approval] ?? ""}
        </p>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">Run the agent on a demo dispute</h2>
        <p className="mt-1 text-sm text-graphite">
          Each run replays recorded model answers, scores the case in code, and shows what the firewall decides. Nothing is sent to PayPal from here.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {Object.values(SCENARIOS).map((s) => (
            <form key={s.id} action={runScenario} className="flex flex-col rounded border border-rule bg-paper p-4">
              <input type="hidden" name="scenario" value={s.id} />
              <div className="flex items-center gap-2">
                <h3 className="font-bold">{displayTitle(s.title)}</h3>
              </div>
              <p className="mt-1 flex-1 text-sm text-graphite">{BLURB[s.id]}</p>
              <p className="mt-2 text-xs text-faint">{usd(s.dispute.amountCents)} disputed, {s.dispute.stage === "INQUIRY" ? "inquiry stage" : "claim stage"}. Synthetic.</p>
              <button className="btn-primary mt-3 self-start">Run demo</button>
            </form>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Recent runs</h2>
        {runs.length === 0 ? (
          <p className="mt-2 text-sm text-faint">No runs yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-rule rounded-lg border border-rule">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/desk/run/${r.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-sunk">
                  <span>{displayTitle(SCENARIOS[r.scenario]?.title ?? r.scenario)}</span>
                  <span className="flex items-center gap-2">
                    <Badge>{r.choice?.toLowerCase()}</Badge>
                    <Badge tone={gateTone(r.gate)}>{r.gate === "ALLOW" ? "allowed" : r.gate === "DENY" ? "denied" : r.gate ? "held for seller" : "no action"}</Badge>
                    <span className="text-xs tabular-nums text-faint">{new Date(r.at).toISOString().slice(11, 16)} UTC</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Waiting for the seller</h2>
        <p className="mt-1 text-sm text-graphite">Actions the firewall marked REQUIRE_APPROVAL on real sandbox disputes. Approval never overrides a DENY.</p>
        {live.pending.length === 0 ? (
          <p className="mt-2 text-sm text-faint">Nothing waiting.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {live.pending.map((p) => (
              <li key={p.id} className="rounded-lg border border-rule p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.action_type}</strong>
                  {"amountCents" in p.params && <span>{usd(p.params.amountCents)}</span>}
                  <span className="text-faint">on {p.dispute_id}</span>
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
                  <p className="mt-2 text-xs text-faint">Approvals are off on this deploy (no approver password set).</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold tracking-tight">Sandbox disputes</h2>
        <p className="mt-1 text-sm text-graphite">Real PayPal sandbox disputes the worker has synced, with the actions PayPal allows right now.</p>
        {live.disputes.length === 0 ? (
          <p className="mt-2 text-sm text-faint">None synced yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto rounded-lg border border-rule">
            <table className="w-full text-left text-sm">
              <thead className="bg-sunk text-xs text-faint">
                <tr><th className="px-3 py-2">Dispute</th><th className="px-3 py-2">Reason</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Amount</th><th className="px-3 py-2">Allowed now</th></tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {live.disputes.map((d) => (
                  <tr key={d.id}>
                    <td className="px-3 py-2 font-mono text-xs">{d.id}</td>
                    <td className="px-3 py-2">{d.reason.replaceAll("_", " ").toLowerCase()}</td>
                    <td className="px-3 py-2">{d.status}{d.stage ? `, ${d.stage.toLowerCase()}` : ""}</td>
                    <td className="px-3 py-2">{usd(d.amount_cents)} {d.currency}</td>
                    <td className="px-3 py-2 text-xs">{(d.links ?? []).map((l) => l.rel).filter((r) => r !== "self").join(", ") || "none"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
