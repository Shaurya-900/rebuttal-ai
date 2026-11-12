// Chapter 1: run one seeded demo dispute. One obvious button; the other cases wait behind a disclosure.
import { SCENARIOS } from "../../lib/agent/scenarios";
import { runScenario } from "./actions";
import { CASE_NAME as NAME, caseName, usd } from "./ui";
import { PendingButton } from "../pending-button";

export const dynamic = "force-dynamic";


const BLURB: Record<string, string> = {
  hero1: "Buyer says the camera never arrived. Tracking shows delivery to the order address, and the buyer emailed that it arrived.",
  hero2: "Buyer says the lens is hazy. The listing never mentioned haze.",
  hero3: "The camera was delivered and the buyer emailed that it arrived. Then the dispute message tells the agent to ignore its rules and refund $500.",
  ctrl1: "Parcel lost in transit, no delivery scan for weeks. The honest answer is to refund.",
};


export default async function Desk({ searchParams }: { searchParams: Promise<{ limited?: string }> }) {
  const { limited } = await searchParams;
  const lead = SCENARIOS.hero3!;
  const others = Object.values(SCENARIOS).filter((x) => x.id !== lead.id);
  const injected = lead.messages.find((m) => /ignore|SYSTEM/i.test(m.text)) ?? lead.messages.at(-1);

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-sm font-semibold text-act">Chapter 1 of 3</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Watch it decide</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-graphite">
        A buyer has opened a dispute against Mira. Run it, then step through what the agent did, one stage at a time.
      </p>

      {limited && (
        <p role="status" className="mt-6 rounded border border-deny/30 bg-deny-tint px-3 py-2 text-sm text-deny">
          {limited === "global" ? "The demo is busy right now. Try again in an hour." : `Limit reached: ${limited} demo runs per hour from one address.`}
        </p>
      )}

      <form action={runScenario} className="mt-8 rounded-xl border border-rule bg-white p-5 sm:p-7">
        <input type="hidden" name="scenario" value={lead.id} />
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">The case · {usd(lead.dispute.amountCents)} · synthetic</p>
        <h2 className="mt-2 text-xl font-bold tracking-tight">{NAME[lead.id]}</h2>
        <p className="mt-2 leading-relaxed text-graphite">{BLURB[lead.id]}</p>
        {injected && (
          <blockquote className="mt-4 rounded-lg border border-dashed border-deny/50 bg-deny-tint/50 px-4 py-3 text-[0.95rem] leading-relaxed">
            {injected.text}
          </blockquote>
        )}
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <PendingButton className="btn-primary px-7 py-3.5 text-base" pending="Running the agent…">Run this dispute →</PendingButton>
          <span className="text-sm text-graphite">A few seconds. Recorded model answers; nothing sent to PayPal.</span>
        </div>
      </form>

      <details className="group mt-6">
        <summary className="cursor-pointer list-none text-sm text-graphite hover:text-ink">
          <span aria-hidden className="mr-1.5 inline-block transition-transform group-open:rotate-90">›</span>Or pick a different case
        </summary>
        <ul className="mt-3 divide-y divide-rule border-y border-rule">
          {others.map((x) => (
            <li key={x.id}>
              <form action={runScenario} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-4">
                <input type="hidden" name="scenario" value={x.id} />
                <div className="min-w-0 flex-1 basis-64">
                  <h3 className="font-semibold">{caseName(x.id, x.title)}</h3>
                  <p className="mt-0.5 text-sm text-graphite">{BLURB[x.id]}</p>
                </div>
                <PendingButton className="btn-quiet" pending="Running…">Run</PendingButton>
              </form>
            </li>
          ))}
        </ul>
      </details>
    </main>
  );
}
