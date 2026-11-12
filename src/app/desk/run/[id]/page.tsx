// One stored agent run, stage by stage, with every point citing its source record.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ITEM_LABELS } from "../../../../lib/agent/rubric";
import { SCENARIOS } from "../../../../lib/agent/scenarios";
import { getDb } from "../../../../lib/db/client";
import { getRun } from "../../../../lib/desk";
import type { Decision } from "../../../../lib/firewall/types";
import { NextStep } from "../../../flow";
import { Walkthrough, type Step } from "../../../walkthrough";
import { caseName, describeAction, FIELD_LABEL, fieldValue, Verdict, ruleName, usd } from "../../ui";

export const dynamic = "force-dynamic";

const CHOICE: Record<string, string> = { FIGHT: "fight it with evidence", OFFER: "offer a partial refund", ACCEPT: "accept and refund" };

function GateView({ g }: { g: Decision | null }) {
  if (!g) return <p className="text-sm text-faint">No action proposed.</p>;
  return (
    <div className="space-y-2 pt-1">
      <Verdict decision={g} />
      {g.fired.length > 1 && (
        <p className="text-xs text-graphite">Every rule that fired: {g.fired.map((f) => `${f.rule} (${ruleName(f.rule)})`).join("; ")}.</p>
      )}
    </div>
  );
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const got = await getRun(getDb(), id);
  if (!got) notFound();
  const { run } = got;
  const s = SCENARIOS[run.scenarioId];
  const stubbed = run.llmCalls.some((c) => c.recordedFrom.startsWith("stub"));
  const d = run.decision;
  const injected = Object.values(run.quarantine).some((q) => q?.containsInstructions);
  const steps: Step[] = [
    {
      label: "Quarantine", title: "The buyer's words are locked away",
      lead: "Buyer text is untrusted. A model with no tools turns it into fixed fields. The agent that decides never sees the words themselves.",
      body: (
        <div className="space-y-3">
          {s?.messages.map((m) => {
            const q = run.quarantine[m.id];
            return (
              <div key={m.id} className="grid items-start gap-4 sm:grid-cols-2">
                <div className="rounded-lg border border-dashed border-deny/50 bg-deny-tint/40 p-3">
                  <p className="text-xs font-semibold text-deny">What the buyer wrote ({m.channel === "email" ? "email" : "dispute message"})</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 rounded-lg bg-sunk p-3 text-sm">
                  <p className="col-span-2 text-xs font-semibold text-graphite">What the agent sees instead</p>
                  {q && Object.entries(q).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-graphite">{FIELD_LABEL[k] ?? k}</dt>
                      <dd className={k === "containsInstructions" && v ? "font-semibold text-deny" : ""}>{fieldValue(k, v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      label: "Score", title: `Mira's case scores ${run.rubric.score} of 100`,
      lead: `How strong her case is for "${run.rubric.reason === "INR" ? "item not received" : "not as described"}". The model only points at records; code checks each one and awards the points.`,
      body: (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <tbody className="divide-y divide-rule">
                {run.rubric.items.map((it) => (
                  <tr key={it.itemId}>
                    <td className="py-2 pr-3">{ITEM_LABELS[it.itemId]}</td>
                    <td className={`py-2 pr-3 text-right font-semibold tabular-nums ${it.awarded ? "" : "text-faint"}`}>{it.awarded}/{it.weight}</td>
                    <td className="py-2 text-xs">{it.awarded ? <span className="font-mono text-graphite">[{it.sourceId}]</span> : <span className="text-faint">{it.why}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {run.rubric.capped && <p className="mt-2 text-sm text-graphite">Score capped at 20: no delivery scan and tracking has been silent for over 14 days.</p>}
          {run.rubric.citationFailures.length > 0 && (
            <p className="mt-2 text-sm text-deny">Rejected citations: {run.rubric.citationFailures.map((c) => `${c.itemId} → ${c.sourceId}`).join(", ")}</p>
          )}
        </>
      ),
    },
    {
      label: "Decision", title: `Decision: ${CHOICE[d.choice] ?? d.choice.toLowerCase()}`,
      lead: "Code picks the option that loses Mira the least money on average, among what PayPal allows right now. The model has no say.",
      body: (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(d.expectedLossCents).map(([k, v]) => (
              <div key={k} className={`rounded-lg border p-3 ${k === d.choice ? "border-act bg-act/5" : "border-rule text-graphite"}`}>
                <p className="text-sm font-semibold">{k === "FIGHT" ? "Fight" : k === "OFFER" ? "Offer" : k === "ACCEPT" ? "Accept" : k}{k === d.choice ? " ✓" : ""}</p>
                <p className="mt-0.5 text-xs">expected loss {usd(v)}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-faint">
            Chance of winning if she fights: {Math.round(d.p * 100)}%{d.choice === "OFFER" ? `. Offer ${usd(d.offerCents)}; chance the buyer accepts: ${Math.round(d.q * 100)}%` : ""}
            {d.removed.length > 0 ? `. Not allowed by PayPal right now: ${d.removed.map((x) => x.toLowerCase()).join(", ")}` : ""}.
          </p>
        </>
      ),
    },
    {
      label: "Firewall", title: "Firewall",
      lead: "Plain code checks the proposed action against ten written rules. Only an allowed action, or one Mira approves, is ever sent.",
      body: (
        <>
          <p className="text-sm"><span className="font-semibold">Proposed:</span> {describeAction(run.proposal)}.</p>
          <div className="mt-4"><GateView g={run.gate} /></div>
        </>
      ),
    },
    ...(run.packet ? [{
      label: "Evidence", title: "The evidence packet",
      lead: "What would go to PayPal. Every line cites the record it came from.",
      body: (
        <>
          <ul className="space-y-1 text-sm">{run.packet.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
          <p className="mt-3 text-xs text-faint">
            <a href={`/desk/run/${got.id}/packet`} className="link">Download the PDF</a>, SHA-256 <span className="id">{run.packet.sha256.slice(0, 16)}…</span>
          </p>
        </>
      ),
    }] : []),
    ...(run.baseline ? [{
      label: "Naive agent", title: "Same dispute, naive agent",
      lead: "One model call that reads the raw buyer text and acts directly: no quarantine, no score, no firewall. Here is its proposal, put through Rebuttal's firewall.",
      body: (
        <>
          <p className="text-sm"><span className="font-semibold">Proposed:</span> {describeAction(run.baseline.proposal)}.</p>
          <p className="mt-2 text-sm italic text-graphite">&ldquo;{run.baseline.reasoning}&rdquo;</p>
          <div className="mt-4"><GateView g={run.baseline.gate} /></div>
          {run.baseline.proposal.type === "SubmitEvidence" && (
            <p className="mt-3 text-xs text-faint">
              In this recorded run the naive agent did not follow the buyer&apos;s instruction, but its evidence is still refused: it names no exhibit on file (I8).
              One recorded run of one model; it does not show a naive agent is safe.
            </p>
          )}
        </>
      ),
    }] : []),
  ];

  const verdict = (
    <section aria-labelledby="outcome" className="card mt-6 p-5 sm:p-7">
      <h2 id="outcome" className="text-sm font-semibold text-graphite">The outcome</h2>
      <p className="mt-2 text-xl font-semibold leading-snug tracking-tight sm:text-2xl">Rebuttal chose to {CHOICE[d.choice] ?? d.choice.toLowerCase()}.</p>
      <p className="mt-1 text-graphite">Proposed: {describeAction(run.proposal)}.</p>
      <div className="mt-5"><GateView g={run.gate} /></div>
      {injected && (
        <p className="mt-5 border-t border-rule pt-4 text-sm leading-relaxed">
          <span className="font-semibold">The buyer&apos;s orders never reached the decision.</span> The quarantine turned them into one field,
          &ldquo;tries to give the AI orders: yes&rdquo;.
        </p>
      )}
    </section>
  );
  const finish = (
    <>
      {verdict}
      <NextStep href="/eval" action="Chapter 2: try to fool it">
        That was a recorded run. Now it&apos;s your turn: play the dishonest buyer and try to talk the agent into a refund.
      </NextStep>
    </>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <p className="eyebrow">Chapter 1 of 3</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{caseName(run.scenarioId, s?.title)}</h1>
      <p className="mt-2 text-sm text-graphite">
        Run {got.id}{s ? ` · a ${usd(s.dispute.amountCents)} dispute, ${s.dispute.reason.replaceAll("_", " ").toLowerCase()}` : ""} ·{" "}
        <span className="text-hold">synthetic, nothing sent to PayPal</span>
      </p>
      <p className="sr-only">Synthetic dispute ({s?.dispute.id}). Nothing on this page was sent to PayPal.</p>
      {stubbed && (
        <p className="mt-4 rounded border border-rule bg-sunk px-3 py-2 text-sm">
          The model answers in this run are hand-written stand-ins until they are re-recorded with a live key. The score, decision and firewall are code and do not depend on them.
        </p>
      )}

      <div className="mt-8">
        <Walkthrough steps={steps} finish={finish} />
      </div>

      <details className="mt-10 text-xs text-faint">
        <summary className="cursor-pointer hover:text-ink">Run details</summary>
        <p className="mt-2">Dispute <span className="font-mono">{s?.dispute.id}</span>, {got.at.replace("T", " ").slice(0, 16)} UTC.</p>
        {run.policy && (
          <p className="mt-1">
            Decided under <Link href="/desk/policy" className="link">Mira&apos;s policy</Link>: offers up to {run.policy.maxOfferPct}%, accept without asking up to{" "}
            {usd(run.policy.autoAcceptMaxCents)}, {usd(run.policy.dailyRefundBudgetCents)} a day.
          </p>
        )}
        <p className="mt-1">Model answers: {[...new Set(run.llmCalls.map((c) => `${c.recordedFrom} (${c.from})`))].join(", ") || "none"}</p>
      </details>

    </main>
  );
}
