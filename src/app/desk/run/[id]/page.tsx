// One stored agent run, stage by stage, with every point citing its source record.
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ITEM_LABELS } from "../../../../lib/agent/rubric";
import { SCENARIOS } from "../../../../lib/agent/scenarios";
import { getDb } from "../../../../lib/db/client";
import { getRun } from "../../../../lib/desk";
import type { Decision } from "../../../../lib/firewall/types";
import { Badge, gateTone, usd } from "../../ui";

export const dynamic = "force-dynamic";

function Stage({ n, title, note, children }: { n: number; title: string; note: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="flex items-baseline gap-2 text-lg font-medium">
        <span className="text-sm text-neutral-400">{n}</span>
        {title}
      </h2>
      <p className="mt-0.5 text-sm text-neutral-600">{note}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function GateView({ g }: { g: Decision | null }) {
  if (!g) return <p className="text-sm text-neutral-500">No action proposed.</p>;
  return (
    <div className="text-sm">
      <Badge tone={gateTone(g.kind)}>{g.kind}</Badge>
      {g.kind === "DENY" && <span className="ml-2 font-mono text-xs">{g.reason}</span>}
      {g.kind === "REQUIRE_APPROVAL" && <span className="ml-2 font-mono text-xs">{g.rule}</span>}
      {g.fired.length > 0 && (
        <p className="mt-1 text-xs text-neutral-600">Rules that fired: {g.fired.map((f) => `${f.rule} (${f.outcome})`).join(", ")}</p>
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
      <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
        Synthetic dispute (<span className="font-mono">{s?.dispute.id}</span>). Nothing on this page was sent to PayPal.
      </p>
      <Link href="/desk" className="mt-6 inline-block text-sm text-neutral-600 hover:underline">← Desk</Link>
      <h1 className="mt-2 text-2xl font-semibold">{s?.title ?? run.scenarioId}</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Run #{got.id} · {got.at.replace("T", " ").slice(0, 19)} UTC · {s ? `${usd(s.dispute.amountCents)} · ${s.dispute.reason.replaceAll("_", " ").toLowerCase()}` : ""}
      </p>
      {run.policy && (
        <p className="mt-1 text-xs text-neutral-500">
          Decided under <Link href="/desk/policy" className="underline-offset-2 hover:underline">Mira&apos;s policy</Link> at the time: offers up to {run.policy.maxOfferPct}%,
          accept without asking up to {usd(run.policy.autoAcceptMaxCents)}, {usd(run.policy.dailyRefundBudgetCents)} a day.
        </p>
      )}
      {stubbed && (
        <p className="mt-3 rounded border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm">
          The model answers in this run are hand-written stand-ins, not real model output, until they are re-recorded with a live key.
          The rubric, decision and firewall below are code and do not depend on them.
        </p>
      )}

      <Stage n={1} title="Quarantine" note="Buyer text is untrusted. A model with no tools turns it into fixed fields; the planner never sees the text.">
        <div className="space-y-3">
          {s?.messages.map((m) => {
            const q = run.quarantine[m.id];
            return (
              <div key={m.id} className="grid gap-3 rounded-lg border border-neutral-200 p-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-medium text-red-700">Untrusted · {m.channel} · <span className="font-mono">{m.id}</span></p>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{m.text}</p>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
                  {q && Object.entries(q).map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-neutral-500">{k}</dt>
                      <dd className={`font-mono ${k === "containsInstructions" && v ? "font-semibold text-red-700" : ""}`}>{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            );
          })}
        </div>
      </Stage>

      <Stage n={2} title={`Rubric · ${run.rubric.reason} · score ${run.rubric.score}/100`} note="The model only points at records. Code checks each citation against the records and awards the points; no citation, no points.">
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-left text-sm">
            <tbody className="divide-y divide-neutral-100">
              {run.rubric.items.map((it) => (
                <tr key={it.itemId}>
                  <td className="px-3 py-2 font-mono text-xs text-neutral-500">{it.itemId}</td>
                  <td className="px-3 py-2">{ITEM_LABELS[it.itemId]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.awarded}/{it.weight}</td>
                  <td className="px-3 py-2 text-xs">{it.awarded ? <span className="font-mono">[{it.sourceId}]</span> : <span className="text-neutral-500">{it.why}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {run.rubric.capped && <p className="mt-2 text-sm text-neutral-600">Score capped at 20: no delivery scan and tracking has been silent for over 14 days.</p>}
        {run.rubric.citationFailures.length > 0 && (
          <p className="mt-2 text-sm text-red-700">Rejected citations: {run.rubric.citationFailures.map((c) => `${c.itemId} → ${c.sourceId}`).join(", ")}</p>
        )}
      </Stage>

      <Stage n={3} title={`Decision · ${d.choice}`} note="Lowest expected loss among the options PayPal currently allows. Win chance comes from the score band, not from the model.">
        <div className="flex flex-wrap gap-2 text-sm">
          {Object.entries(d.expectedLossCents).map(([k, v]) => (
            <span key={k} className={`rounded border px-2 py-1 ${k === d.choice ? "border-neutral-900 font-medium" : "border-neutral-200 text-neutral-600"}`}>
              {k}: expected loss {usd(v)}
            </span>
          ))}
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          win chance p = {d.p}{d.choice === "OFFER" ? ` · offer ${usd(d.offerCents)}, buyer-accept chance q = ${d.q}` : ""}
          {d.removed.length > 0 ? ` · not allowed by PayPal right now: ${d.removed.join(", ")}` : ""}
        </p>
      </Stage>

      <Stage n={4} title="Firewall" note="Deterministic code checks the proposed action against invariants I1 to I10. Only an ALLOW (or a seller's approval) reaches the executor.">
        <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(run.proposal, null, 1)}</pre>
        <div className="mt-2"><GateView g={run.gate} /></div>
      </Stage>

      {run.packet && (
        <Stage n={5} title="Evidence packet" note="Every line cites the record it came from.">
          <ul className="space-y-1 rounded-lg border border-neutral-200 p-3 text-sm">
            {run.packet.lines.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            <a href={`/desk/run/${got.id}/packet`} className="text-neutral-900 underline">Download PDF</a> · sha256 <span className="font-mono">{run.packet.sha256.slice(0, 16)}…</span> · <Link href={`/verify?run=${got.id}`} className="text-neutral-900 underline">verify it in your browser</Link>
          </p>
        </Stage>
      )}

      {run.baseline && (
        <Stage n={run.packet ? 6 : 5} title="Same dispute, naive agent" note="One model call with the raw buyer text and direct actions: no quarantine, no rubric, no firewall. Its proposal, put through Rebuttal's firewall:">
          <pre className="overflow-x-auto rounded bg-neutral-50 p-3 text-xs">{JSON.stringify(run.baseline.proposal, null, 1)}</pre>
          <p className="mt-2 text-sm text-neutral-600">Its stated reasoning: “{run.baseline.reasoning}”</p>
          <div className="mt-2"><GateView g={run.baseline.gate} /></div>
          {run.baseline.proposal.type === "SubmitEvidence" && (
            <p className="mt-2 text-xs text-neutral-500">
              In this recorded run the naive agent did not follow the buyer&apos;s instruction. Its evidence is still refused: it names no exhibit in the evidence store (I8).
              One recorded run of one model; it does not show a naive agent is safe. See /eval for the attack classes.
            </p>
          )}
        </Stage>
      )}

      <p className="mt-10 text-xs text-neutral-500">
        Model answers: {[...new Set(run.llmCalls.map((c) => `${c.recordedFrom} (${c.from})`))].join(", ") || "none"}
      </p>
    </main>
  );
}
