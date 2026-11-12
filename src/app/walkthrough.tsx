"use client";
// A story told one step at a time: one big Next button reveals each stage (fixed to the bottom of the screen on
// phones, so it is always under the thumb), Back goes back, and "Show all steps" opens everything at once.
// Stage content is rendered on the server and passed in, so nothing here knows about disputes.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BorderBeam } from "../components/velora/border-beam";

export type Step = { label: string; title: string; lead: string; body: ReactNode };

export function Walkthrough({ steps, finish }: { steps: Step[]; finish?: ReactNode }) {
  const [i, setI] = useState(0);
  const [all, setAll] = useState(false);
  const top = useRef<HTMLDivElement>(null);
  const moved = useRef(false);
  const last = i === steps.length - 1;

  useEffect(() => {
    if (!moved.current) return;
    const el = top.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [i]);
  const go = (n: number) => { moved.current = true; setI(Math.max(0, Math.min(steps.length - 1, n))); };

  if (all) {
    return (
      <div ref={top} className="scroll-mt-24">
        <button type="button" onClick={() => setAll(false)} className="text-sm text-act underline-offset-4 hover:underline">Go back to one step at a time</button>
        <div className="mt-6 space-y-8">
          {steps.map((s, n) => <Panel key={s.label} n={n} total={steps.length} s={s} />)}
          {finish}
        </div>
      </div>
    );
  }

  return (
    <div ref={top} className="scroll-mt-24">
      <div className="flex items-center justify-between gap-4 text-sm">
        <p className="font-medium">Step {i + 1} of {steps.length}: {steps[i]!.label}</p>
        <button type="button" onClick={() => setAll(true)} className="shrink-0 text-graphite underline-offset-4 hover:text-ink hover:underline">Show all steps</button>
      </div>
      <div className="mt-2 flex gap-1" aria-hidden>
        {steps.map((s, n) => (
          <button key={s.label} type="button" tabIndex={-1} onClick={() => go(n)} title={s.label}
            className={`h-1.5 flex-1 rounded-sm transition-colors ${n <= i ? "bg-act" : "bg-rule hover:bg-graphite/40"}`} />
        ))}
      </div>

      <div key={i} className="mt-5 animate-[fade_200ms_ease-out]">
        <Panel n={i} total={steps.length} s={steps[i]!} beam />
      </div>

      {!last && (
        <>
          {/* Phones: a bar fixed to the bottom of the screen. Larger screens: the buttons sit under the step. */}
          <div className="h-24 sm:hidden" aria-hidden />
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-white/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:static sm:mt-6 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <div className="flex gap-3">
              {i > 0 && <button type="button" onClick={() => go(i - 1)} className="btn-quiet shrink-0">← Back</button>}
              <button type="button" onClick={() => go(i + 1)} className="btn-primary flex-1 px-6 py-3 text-base sm:flex-none">
                Next: {steps[i + 1]!.label} →
              </button>
            </div>
          </div>
        </>
      )}
      {last && (
        <>
          <button type="button" onClick={() => go(i - 1)} className="btn-quiet mt-6">← Back</button>
          {finish}
        </>
      )}
    </div>
  );
}

function Panel({ n, total, s, beam = false }: { n: number; total: number; s: Step; beam?: boolean }) {
  return (
    <section aria-labelledby={`step-${n}`} className="card overflow-hidden p-4 sm:p-7">
      {beam && <BorderBeam size={80} duration={7} />}
      <p className="text-xs font-medium uppercase tracking-wider text-act">Step {n + 1} of {total}</p>
      <h2 id={`step-${n}`} className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">{s.title}</h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-graphite">{s.lead}</p>
      <div className="mt-5">{s.body}</div>
    </section>
  );
}
