// One stored agent run, stage by stage, with every point citing its source record.
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ITEM_LABELS } from "../../../../lib/agent/rubric";
import { SCENARIOS } from "../../../../lib/agent/scenarios";
import { getDb } from "../../../../lib/db/client";
import { getRun } from "../../../../lib/desk";
import type { Decision } from "../../../../lib/firewall/types";
import { displayTitle, Stamp, ruleName, usd } from "../../ui";

export const dynamic = "force-dynamic";

function Stage({ n, title, note, children }: { n: number; title: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 text-xl font-bold tracking-tight">
        <span className="text-sm text-faint">{n}</span>
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

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <p className="rounded bg-hold-tint px-3 py-2 text-sm text-hold">
        Synthetic dispute (<span className="font-mono">{s?.dispute.id}</span>). Nothing on this page was sent to PayPal.
      </p>
      <Link href="/desk" className="mt-6 inline-block text-sm text-graphite hover:underline">← Desk</Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">{displayTitle(s?.title ?? run.scenarioId)}</h1>
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

      <Stage n={1} title="Quarantine" note="Buyer text is untrusted. A model with no tools turns it into fixed fields; the planner never sees the text.">
        <div className="space-y-3">
          {s?.messages.map((m) => {
            const q = run.quarantine[m.id];
            return (
              <div key={m.id} className="grid gap-3 rounded-lg border border-rule p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-deny">Untrusted {m.channel === "email" ? "email" : "dispute message"} <span className="id">{m.id}</span></p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {q && Object.entries(q).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-faint">{k}</dt>
                      <dd className={`font-mono ${k === "containsInstructions" && v ? "font-semibold text-deny" : ""}`}>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </Stage>

      <Stage n={2} title={`Rubric: ${run.rubric.score} of 100 (${run.rubric.reason === "INR" ? "item not received" : "not as described"})`} note="The model only points at records. Code checks each citation against the records and awards the points; no citation, no points.">
        <div className="overflow-x-auto rounded-lg border border-rule">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-rule">
              {run.rubric.items.map((it) => (
                <tr key={it.itemId}>
                  <td className="px-3 py-2 font-mono text-xs text-faint">{it.itemId}</td>
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

      <Stage n={3} title={`Decision: ${d.choice.toLowerCase()}`} note="Lowest expected loss among the options PayPal currently allows. Win chance comes from the score band, not from the model.">
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(d.expectedLossCents).map(([k, v]) => (
            <span key={k} className={`rounded border px-2 py-1 ${k === d.choice ? "border-ink font-medium" : "border-rule text-graphite"}`}>
              {k}: expected loss {usd(v)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-faint">
          win chance p = {d.p}{d.choice === "OFFER" ? `; offer ${usd(d.offerCents)}, buyer-accept chance q = ${d.q}` : ""}
          {d.removed.length > 0 ? `; not allowed by PayPal right now: ${d.removed.join(", ")}` : ""}
        </p>
      </Stage>

      <Stage n={4} title="Firewall" note="Deterministic code checks the proposed action against invariants I1 to I10. Only an ALLOW (or a seller's approval) reaches the executor.">
        <pre className="overflow-x-auto rounded bg-sunk p-3 text-xs">{JSON.stringify(run.proposal, null, 1)}</pre>
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
          <pre className="overflow-x-auto rounded bg-sunk p-3 text-xs">{JSON.stringify(run.baseline.proposal, null, 1)}</pre>
          <p className="mt-2 text-sm text-graphite">Its stated reasoning: “{run.baseline.reasoning}”</p>
          <div className="mt-2"><GateView g={run.baseline.gate} /></div>
          {run.baseline.proposal.type === "SubmitEvidence" && (
            <p className="mt-2 text-xs text-faint">
              In this recorded run the naive agent did not follow the buyer&apos;s instruction. Its evidence is still refused: it names no exhibit in the evidence store (I8).
              One recorded run of one model; it does not show a naive agent is safe. See /eval for the attack classes.
            </p>
          )}
        </Stage>
      )}

      <p className="mt-10 text-xs text-faint">
        Model answers: {[...new Set(run.llmCalls.map((c) => `${c.recordedFrom} (${c.from})`))].join(", ") || "none"}
      </p>
    </main>
  );
}
