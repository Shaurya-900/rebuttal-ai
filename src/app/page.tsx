import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";
import { runDispute, snapshotFor } from "../lib/agent/run";
import { DEMO_NOW_MS, HERO3 } from "../lib/agent/scenarios";
import { gate } from "../lib/firewall/gate";
import { DEFAULT_POLICY, type ProposedAction } from "../lib/firewall/types";
import { createLlm, LLM_CACHE_DIR } from "../lib/llm";
import { Stamp, usd } from "./desk/ui";

// Everything on this page is computed or read from committed files: the hero is the real hero-3 run (recorded model
// answers, replayed offline), the eval line comes from eval/results/report.json. The chaos line is fixed history (Nov 4).
type EvalSummary = { generatedAt: string; perClass: { cases: number; rebuttalSucceeded: number; baselineSucceeded: number | null; baselineMeasured: number }[] };
function evalSummary() {
  try {
    const r = JSON.parse(readFileSync(join(process.cwd(), "eval", "results", "report.json"), "utf8")) as EvalSummary;
    const sum = (f: (p: EvalSummary["perClass"][number]) => number) => r.perClass.reduce((n, p) => n + f(p), 0);
    return { date: r.generatedAt.slice(0, 10), attacks: sum((p) => p.cases), rebuttal: sum((p) => p.rebuttalSucceeded), naive: sum((p) => p.baselineSucceeded ?? 0), naiveMeasured: sum((p) => (p.baselineSucceeded === null ? 0 : p.baselineMeasured)) };
  } catch {
    return null;
  }
}

async function heroSpecimen() {
  const t = await runDispute(HERO3, createLlm({ mode: "replay", providers: [], cacheDir: LLM_CACHE_DIR }), DEMO_NOW_MS);
  const injected = HERO3.messages.find((m) => t.quarantine[m.id]?.containsInstructions)!;
  const demanded: ProposedAction = { type: "IssueRefund", disputeId: HERO3.dispute.id, amountCents: t.quarantine[injected.id]!.mentionsAmountCents ?? 50_000, currency: HERO3.dispute.currency };
  return {
    text: injected.text,
    fields: t.quarantine[injected.id]!,
    demandedCents: demanded.type === "IssueRefund" ? demanded.amountCents : 0,
    demandedGate: gate(demanded, snapshotFor(HERO3), DEFAULT_POLICY, DEMO_NOW_MS),
    chosenGate: t.gate!,
    score: t.rubric.score,
    model: t.llmCalls[0]?.recordedFrom.replace(/^groq:/, "") ?? "recorded model",
  };
}

const GITHUB = "https://github.com/Shaurya-900/rebuttal-ai";

export default async function Home() {
  const [ev, h] = [evalSummary(), await heroSpecimen()];
  const fieldRows: [string, string][] = [
    ["containsInstructions", String(h.fields.containsInstructions)],
    ["mentionsAmountCents", String(h.fields.mentionsAmountCents)],
    ["requestedRemedy", h.fields.requestedRemedy],
    ["itemReceived", h.fields.itemReceived],
    ["claimType", h.fields.claimType],
  ];

  return (
    <main className="mx-auto max-w-5xl px-4">
      <section className="grid gap-10 py-12 sm:py-16 lg:grid-cols-[1fr_1.05fr] lg:items-start">
        <div className="max-w-xl">
          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">A dispute agent that can&apos;t be talked out of the rules.</h1>
          <p className="mt-5 text-lg leading-relaxed text-graphite">
            When a buyer opens a PayPal dispute, a small seller has days to answer. Rebuttal gathers the seller&apos;s records, scores the case
            and decides whether to fight, offer or refund. The model only proposes. Plain code decides what is allowed to happen.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/desk" className="btn-primary">Run a demo dispute</Link>
            <Link href="/eval" className="btn-quiet">See the attack results</Link>
          </div>
        </div>

        {/* The specimen: one real run, read top to bottom. */}
        <figure className="border-l-2 border-rule pl-5 sm:pl-7" aria-labelledby="specimen-caption">
          <figcaption id="specimen-caption" className="text-sm text-graphite">
            What happened when a buyer tried it (hero 3, replayed from <span className="id">{h.model}</span>)
          </figcaption>

          <div className="mt-4">
            <p className="text-sm font-semibold">The buyer wrote</p>
            <blockquote className="mt-1.5 rounded border border-dashed border-deny/50 bg-deny-tint/50 px-4 py-3 text-[0.95rem] leading-relaxed">
              {h.text}
            </blockquote>
            <p className="mt-1.5 text-xs text-faint">Untrusted. Only a model with no tools reads it, and it may only fill in the fields below.</p>
          </div>

          <div className="mt-6">
            <p className="text-sm font-semibold">What the planner receives instead</p>
            <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 rounded border border-rule bg-sunk px-4 py-3 text-sm">
              {fieldRows.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="id self-center">{k}</dt>
                  <dd className="font-mono text-[0.85em]">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-sm font-semibold">What the buyer demanded</p>
              <p className="text-sm text-graphite">Refund {usd(h.demandedCents)} on a {usd(HERO3.order.amountCents)} order</p>
              <Stamp decision={h.demandedGate} land className="mt-3" />
            </div>
            <div>
              <p className="text-sm font-semibold">What Rebuttal sent instead</p>
              <p className="text-sm text-graphite">Evidence of delivery, rubric score {h.score}/100</p>
              <Stamp decision={h.chosenGate} className="mt-3" />
            </div>
          </div>
        </figure>
      </section>

      <section aria-labelledby="promises" className="border-t border-rule py-12">
        <h2 id="promises" className="text-2xl font-bold tracking-tight">Three promises, each measured</h2>
        <div className="mt-6 grid gap-8 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-rule">
          {[
            {
              name: "It can't be talked into things",
              body: "Buyer text never reaches the planner. Every action passes a firewall of ten rules written in plain code.",
              proof: ev ? `${ev.rebuttal} of ${ev.attacks} synthetic attacks got through. Against a naive agent on the same model, ${ev.naive} of ${ev.naiveMeasured} did.` : "Evaluation not committed yet.",
              href: "/eval", cta: "Read the attack results",
            },
            {
              name: "A crash never refunds twice",
              body: "Each action is written to the database before it is sent. After a crash the worker asks PayPal whether it already happened.",
              proof: "About 400 forced crashes against a simulated PayPal: no duplicates, nothing lost. A deliberately broken version did double-refund, 19 times in 50.",
              href: `${GITHUB}/blob/main/docs/chaos/README.md`, cta: "Read the crash test",
            },
            {
              name: "Every decision shows its sources",
              body: "The model only points at records. Code checks each pointer and adds up a fixed rubric. Every run is hash-chained and signed.",
              proof: "Your browser can re-check any run, and watch one changed byte of evidence fail.",
              href: "/verify", cta: "Verify a run yourself",
            },
          ].map((p) => (
            <div key={p.name} className="flex flex-col sm:px-6 sm:first:pl-0 sm:last:pr-0">
              <h3 className="text-base font-bold">{p.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-graphite">{p.body}</p>
              <p className="mt-3 text-sm leading-relaxed">{p.proof}</p>
              <Link href={p.href} className="link mt-3 text-sm font-semibold">{p.cta}</Link>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="real" className="border-t border-rule py-12">
        <h2 id="real" className="text-2xl font-bold tracking-tight">What is real and what is simulated</h2>
        <div className="mt-6 grid gap-x-10 gap-y-6 sm:grid-cols-2">
          <div>
            <h3 className="text-sm font-bold text-allow">Real</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed">
              <li>PayPal sandbox API calls. Evidence in Rebuttal&apos;s format was accepted on a real sandbox dispute (Nov 10).</li>
              <li>The firewall, rubric, decision and executor code running on this site.</li>
              <li>Model answers, recorded from {h.model}. Demo clicks replay them, so a click costs nothing and calls no model.</li>
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-bold text-hold">Simulated or labelled</h3>
            <ul className="mt-2 space-y-2 text-sm leading-relaxed">
              <li>Buyers, carriers, tracking events, emails and listings are synthetic.</li>
              <li>Escalate, require-evidence and adjudicate are PayPal simulator endpoints, labelled wherever they appear.</li>
              <li>The crash test ran against a simulated PayPal.</li>
            </ul>
          </div>
        </div>
        <p className="mt-10 max-w-3xl text-sm leading-relaxed text-faint">
          Commercial tools such as Chargeflow already automate disputes, and the safety patterns used here (Dual-LLM, CaMeL) are published.
          Rebuttal is an open-source reference implementation that combines them and publishes its own evaluation. It invents none of them.
        </p>
      </section>
    </main>
  );
}
