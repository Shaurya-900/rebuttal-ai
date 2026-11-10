import { readFileSync } from "node:fs";
import { join } from "node:path";
import Link from "next/link";

// Numbers on this page come from committed files (eval report) or dated runs recorded in docs/. Nothing is typed in by hand
// except the chaos result, which is fixed history (docs/chaos/README.md, Nov 4).
type EvalSummary = { generatedAt: string; perClass: { cases: number; rebuttalSucceeded: number; baselineSucceeded: number | null; baselineMeasured: number }[] };
function evalSummary() {
  try {
    const r = JSON.parse(readFileSync(join(process.cwd(), "eval", "results", "report.json"), "utf8")) as EvalSummary;
    const sum = (f: (p: EvalSummary["perClass"][number]) => number) => r.perClass.reduce((n, p) => n + f(p), 0);
    return {
      date: r.generatedAt.slice(0, 10), attacks: sum((p) => p.cases), rebuttal: sum((p) => p.rebuttalSucceeded),
      naive: sum((p) => p.baselineSucceeded ?? 0), naiveMeasured: sum((p) => (p.baselineSucceeded === null ? 0 : p.baselineMeasured)),
    };
  } catch {
    return null;
  }
}

const GITHUB = "https://github.com/Shaurya-900/rebuttal-ai";

export default function Home() {
  const ev = evalSummary();
  const promises = [
    {
      name: "Unfoolable",
      claim: "Buyer text cannot make it do what the seller's rules forbid.",
      how: "Buyer messages go through a model with no tools that turns them into fixed fields. Every action passes a firewall written in plain code with ten rules.",
      proof: ev
        ? `${ev.rebuttal} of ${ev.attacks} synthetic attacks got through, against ${ev.naive} of ${ev.naiveMeasured} on a naive agent with the same model (${ev.date}).`
        : "Attack evaluation not committed yet.",
      href: "/eval",
    },
    {
      name: "Crash-proof",
      claim: "A crash or retry never causes two refunds or a lost action.",
      how: "Every action is written to Postgres before it is sent. After a crash the worker asks PayPal whether it already happened before trying again.",
      proof: "About 400 kill -9s against a simulated PayPal: 0 duplicates, 0 missing (Nov 4). A deliberately broken control did double-refund, 19 of 50.",
      href: `${GITHUB}/blob/main/docs/chaos/README.md`,
    },
    {
      name: "Auditable",
      claim: "Every decision cites the records it rests on.",
      how: "The model only points at records; code checks each pointer and adds up a fixed rubric. The evidence PDF ends every line with its source.",
      proof: "Every run is hash-chained and the chain head is signed. Your browser can re-check it, and see one changed byte fail.",
      href: "/verify",
    },
  ];

  return (
    <main className="mx-auto max-w-4xl px-4 py-12">
      <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">
        PayPal sandbox only. Every buyer, order, carrier and message in the demo is <strong>synthetic</strong>.
      </p>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight sm:text-4xl">Rebuttal</h1>
      <p className="mt-2 text-lg text-neutral-700">A PayPal dispute agent that cannot be talked out of the rules.</p>
      <p className="mt-4 max-w-2xl text-neutral-600">
        When a buyer opens a dispute, a small seller has days to answer with evidence, an offer or a refund. Rebuttal reads the dispute, gathers the
        seller&apos;s records, scores the case, and decides whether to fight, offer or accept. The model only proposes; code decides what is allowed to happen.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/desk" className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700">Run a demo dispute</Link>
        <Link href="/eval" className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50">See the attack evaluation</Link>
        <a href={GITHUB} className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium hover:bg-neutral-50">Code (MIT)</a>
      </div>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {promises.map((p) => (
          <div key={p.name} className="flex flex-col rounded-lg border border-neutral-200 p-5">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm font-medium text-neutral-800">{p.claim}</p>
            <p className="mt-2 text-sm text-neutral-600">{p.how}</p>
            <p className="mt-3 border-t border-neutral-100 pt-3 text-sm text-neutral-900">{p.proof}</p>
            <Link href={p.href} className="mt-auto pt-3 text-sm text-neutral-600 underline-offset-2 hover:underline">Check it →</Link>
          </div>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-lg font-medium">What is real and what is simulated</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-neutral-500"><th className="py-2 pr-4 font-medium">Real</th><th className="py-2 font-medium">Simulated or labelled</th></tr></thead>
            <tbody className="align-top">
              <tr className="border-b"><td className="py-2 pr-4">PayPal sandbox API calls. Evidence submitted through it was accepted on a real sandbox dispute (Nov 10).</td><td className="py-2">Escalate, require-evidence and adjudicate are PayPal <strong>simulator</strong> endpoints, labelled wherever they appear.</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">The firewall, rubric, decision and executor code you see running.</td><td className="py-2">Buyers, carriers, tracking events, emails and listings are <strong>synthetic</strong>.</td></tr>
              <tr className="border-b"><td className="py-2 pr-4">Model answers, recorded from <span className="font-mono text-xs">openai/gpt-oss-120b</span>. Demo clicks replay them, so they cost nothing.</td><td className="py-2">The crash test ran against a <strong>simulated</strong> PayPal.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <p className="mt-12 text-sm text-neutral-500">
        Prior art: commercial tools such as Chargeflow already automate disputes, and the safety patterns (Dual-LLM, CaMeL) are published.
        Rebuttal is an open-source reference implementation that combines them and publishes its own evaluation. It invents none of them.
      </p>
    </main>
  );
}
