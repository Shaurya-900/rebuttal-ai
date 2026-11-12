// One stored agent run, stage by stage, with every point citing its source record.
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ITEM_LABELS } from "../../../../lib/agent/rubric";
import { SCENARIOS } from "../../../../lib/agent/scenarios";
import { getDb } from "../../../../lib/db/client";
import { getRun } from "../../../../lib/desk";
import type { Decision } from "../../../../lib/firewall/types";
import { NextStep, RouteBar } from "../../../flow";
import { caseName, describeAction, FIELD_LABEL, fieldValue, Stamp, ruleName, usd } from "../../ui";

export const dynamic = "force-dynamic";

const STAGES = ["Quarantine", "Score", "Decision", "Firewall", "Evidence", "Naive agent"] as const;
const CHOICE: Record<string, string> = { FIGHT: "fight it with evidence", OFFER: "offer a partial refund", ACCEPT: "accept and refund" };

function Stage({ n, title, note, children }: { n: number; title: string; note: string; children: ReactNode }) {
  return (
    <section id={`stage-${n}`} className="mt-10 scroll-mt-6 border-t border-rule pt-6">
      <h2 className="flex items-baseline gap-2 text-xl font-bold tracking-tight">
        <span className="grid size-6 shrink-0 place-items-center self-center rounded-full border border-rule text-xs font-bold tabular-nums text-graphite">{n}</span>
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-graphite">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GateView({ g }: { g: Decision | null }) {
  if (!g) return <p className="text-sm text-faint">No action proposed.</p>;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-1 text-sm">
      <Stamp decision={g} />
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
  const stageCount = 4 + (run.packet ? 1 : 0) + (run.baseline ? 1 : 0);
  const stageNames = [...STAGES.slice(0, 4), ...(run.packet ? ["Evidence"] : []), ...(run.baseline ? ["Naive agent"] : [])];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="rounded bg-hold-tint px-3 py-2 text-sm text-hold">
        Synthetic dispute (<span className="font-mono">{s?.dispute.id}</span>). Nothing on this page was sent to PayPal.
      </p>
      <div className="mt-6"><RouteBar current={1} /></div>
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">{caseName(run.scenarioId, s?.title)}</h1>
      <p className="mt-1 text-sm text-graphite">
        Run {got.id}, {got.at.replace("T", " ").slice(0, 16)} UTC{s ? `. A ${usd(s.dispute.amountCents)} dispute: ${s.dispute.reason.replaceAll("_", " ").toLowerCase()}.` : ""}
      </p>
      {run.policy && (
        <p className="mt-1 text-xs text-faint">
          Decided under <Link href="/desk/policy" className="underline-offset-2 hover:underline">Mira&apos;s policy</Link> at the time: offers up to {run.policy.maxOfferPct}%,
          accept without asking up to {usd(run.policy.autoAcceptMaxCents)}, {usd(run.policy.dailyRefundBudgetCents)} a day.
        </p>
      )}
      {stubbed && (
        <p className="mt-3 rounded border border-rule bg-sunk px-3 py-2 text-sm">
          The model answers in this run are hand-written stand-ins, not real model output, until they are re-recorded with a live key.
          The rubric, decision and firewall below are code and do not depend on them.
        </p>
      )}

      <section aria-labelledby="outcome" className="mt-8 rounded-lg border-2 border-ink p-5 sm:p-6">
        <h2 id="outcome" className="text-sm font-semibold text-graphite">The outcome</h2>
        <div className={`mt-3 grid gap-6 ${run.baseline ? "md:grid-cols-2 md:divide-x md:divide-rule" : ""}`}>
          <div>
            <p className="text-lg font-bold leading-snug">Rebuttal chose to {CHOICE[d.choice] ?? d.choice.toLowerCase()}.</p>
            <p className="mt-1 text-sm text-graphite">Proposed: {describeAction(run.proposal)}.</p>
            <div className="mt-4"><GateView g={run.gate} /></div>
          </div>
          {run.baseline && (
            <div className="md:pl-6">
              <p className="text-lg font-bold leading-snug">A naive agent on the same model:</p>
              <p className="mt-1 text-sm text-graphite">Proposed: {describeAction(run.baseline.proposal)}.</p>
              <div className="mt-4"><GateView g={run.baseline.gate} /></div>
            </div>
          )}
        </div>
        {injected && (
          <p className="mt-5 border-t border-rule pt-4 text-sm leading-relaxed">
            <span className="font-semibold">The buyer&apos;s orders never reached the decision.</span> The quarantine (stage 1) turned the message into fixed
            fields, &ldquo;tries to give the AI orders: yes&rdquo;, and the planner only ever saw those.
          </p>
        )}
      </section>

      <nav aria-label="How it got there" className="mt-8">
        <p className="text-sm font-semibold">How it got there, in {stageCount} steps</p>
        <ol className="mt-2 flex flex-wrap gap-2 text-sm">
          {stageNames.map((t, i) => (
            <li key={t}><a href={`#stage-${i + 1}`} className="inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1 hover:bg-sunk"><span className="tabular-nums text-graphite">{i + 1}</span>{t}</a></li>
          ))}
        </ol>
      </nav>

      <Stage n={1} title="Quarantine" note="Buyer text is untrusted. A model with no tools turns it into fixed fields; the planner never sees the text.">
        <div className="space-y-3">
          {s?.messages.map((m) => {
            const q = run.quarantine[m.id];
            return (
              <div key={m.id} className="grid gap-3 rounded-lg border border-rule p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold text-deny">What the buyer wrote ({m.channel === "email" ? "email" : "dispute message"}), untrusted</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] content-start gap-x-3 gap-y-1 border-t border-rule pt-3 text-sm sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
                  <p className="col-span-2 text-xs font-semibold text-graphite">What the planner sees instead</p>
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
      </Stage>

      <Stage n={2} title={`Score: ${run.rubric.score} of 100`} note={`How strong Mira's case is for "${run.rubric.reason === "INR" ? "item not received" : "not as described"}". The model only points at records; code checks each one and awards the points. No record, no points.`}>
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-rule">
              {run.rubric.items.map((it) => (
                <tr key={it.itemId}>
                  <td className="px-3 py-2 text-xs tabular-nums text-graphite">{it.itemId}</td>
                  <td className="px-3 py-2">{ITEM_LABELS[it.itemId]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.awarded}/{it.weight}</td>
                  <td className="px-3 py-2 text-xs">{it.awarded ? <span className="font-mono">[{it.sourceId}]</span> : <span className="text-faint">{it.why}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {run.rubric.capped && <p className="mt-2 text-sm text-graphite">Score capped at 20: no delivery scan and tracking has been silent for over 14 days.</p>}
        {run.rubric.citationFailures.length > 0 && (
          <p className="mt-2 text-sm text-deny">Rejected citations: {run.rubric.citationFailures.map((c) => `${c.itemId} → ${c.sourceId}`).join(", ")}</p>
        )}
      </Stage>

      <Stage n={3} title={`Decision: ${CHOICE[d.choice] ?? d.choice.toLowerCase()}`} note="Code picks the option that loses Mira the least money on average, among the options PayPal allows right now. The model has no say here.">
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(d.expectedLossCents).map(([k, v]) => (
            <span key={k} className={`rounded border px-2 py-1 ${k === d.choice ? "border-ink font-medium" : "border-rule text-graphite"}`}>
              {k === "FIGHT" ? "Fight" : k === "OFFER" ? "Offer" : k === "ACCEPT" ? "Accept" : k}: expected loss {usd(v)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">
          Chance of winning if she fights, from the score: {Math.round(d.p * 100)}%{d.choice === "OFFER" ? `. Offer ${usd(d.offerCents)}; chance the buyer accepts: ${Math.round(d.q * 100)}%` : ""}
          {d.removed.length > 0 ? `. Not allowed by PayPal right now: ${d.removed.map((x) => x.toLowerCase()).join(", ")}` : ""}.
        </p>
      </Stage>

      <Stage n={4} title="Firewall" note="Plain code checks the proposed action against ten written rules (I1 to I10). Only an allowed action, or one Mira approves, is ever sent.">
        <p className="text-sm"><span className="font-semibold">Proposed:</span> {describeAction(run.proposal)}.</p>
        <div className="mt-2"><GateView g={run.gate} /></div>
      </Stage>

      {run.packet && (
        <Stage n={5} title="Evidence packet" note="Every line cites the record it came from.">
          <ul className="space-y-1 rounded-lg border border-rule p-3 text-sm">
            {run.packet.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p className="mt-2 text-xs text-faint">
            <a href={`/desk/run/${got.id}/packet`} className="link">Download the PDF</a>, SHA-256 <span className="id">{run.packet.sha256.slice(0, 16)}…</span>. <Link href={`/verify?run=${got.id}`} className="link">Verify it in your browser</Link>.
          </p>
        </Stage>
      )}

      {run.baseline && (
        <Stage n={run.packet ? 6 : 5} title="Same dispute, naive agent" note="One model call with the raw buyer text and direct actions: no quarantine, no rubric, no firewall. Its proposal, put through Rebuttal's firewall:">
          <p className="text-sm"><span className="font-semibold">Proposed:</span> {describeAction(run.baseline.proposal)}.</p>
          <p className="mt-2 text-sm text-graphite">Its stated reasoning: “{run.baseline.reasoning}”</p>
          <div className="mt-2"><GateView g={run.baseline.gate} /></div>
          {run.baseline.proposal.type === "SubmitEvidence" && (
            <p className="mt-2 text-xs text-faint">
              In this recorded run the naive agent did not follow the buyer&apos;s instruction. Its evidence is still refused: it names no exhibit in the evidence store (I8).
              One recorded run of one model; it does not show a naive agent is safe. <Link href="/eval" className="link">See all 24 attacks</Link>.
            </p>
          )}
        </Stage>
      )}

      <p className="mt-10 text-xs text-faint">
        Model answers: {[...new Set(run.llmCalls.map((c) => `${c.recordedFrom} (${c.from})`))].join(", ") || "none"}
      </p>
      <NextStep href="/eval" action="Next: try to fool it">
        That was one dispute. Now see 24 attacks thrown at Rebuttal and at a naive agent on the same model, and how many got through each.
      </NextStep>
    </main>
  );
}
