"use client";
// A story told one step at a time: the visitor clicks Next to reveal each stage, can jump back to any step, or open
// them all at once. Stage content is rendered on the server and passed in, so nothing here knows about disputes.
import { useEffect, useRef, useState, type ReactNode } from "react";

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

  return (
    <div ref={top} className="scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol aria-label="Steps" className="flex flex-wrap gap-1.5">
          {steps.map((s, n) => (
            <li key={s.label}>
              <button type="button" onClick={() => { setAll(false); go(n); }} aria-current={!all && n === i ? "step" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${
                  !all && n === i ? "border-act bg-act text-act-ink" : n < i || all ? "border-rule bg-sunk text-ink hover:border-graphite" : "border-rule text-graphite hover:border-graphite"
                }`}>
                <span className="tabular-nums">{n + 1}</span>
                <span className={!all && n === i ? "" : "hidden sm:inline"}>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => setAll((a) => !a)} className="text-sm text-graphite underline-offset-4 hover:text-ink hover:underline">
          {all ? "One step at a time" : "Show all steps"}
        </button>
      </div>

      {all ? (
        <div className="mt-6 space-y-10">
          {steps.map((s, n) => <Panel key={s.label} n={n} total={steps.length} s={s} />)}
          {finish}
        </div>
      ) : (
        <>
          <div key={i} className="mt-6 animate-[fade_200ms_ease-out]">
            <Panel n={i} total={steps.length} s={steps[i]!} />
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {i > 0 && <button type="button" onClick={() => go(i - 1)} className="btn-quiet">← Back</button>}
            {!last && (
              <button type="button" onClick={() => go(i + 1)} className="btn-primary px-6 py-3 text-base">
                Next: {steps[i + 1]!.label} →
              </button>
            )}
          </div>
          {last && finish}
        </>
      )}
    </div>
  );
}

function Panel({ n, total, s }: { n: number; total: number; s: Step }) {
  return (
    <section aria-labelledby={`step-${n}`} className="rounded-xl border border-rule bg-white p-5 sm:p-7">
      <p className="text-xs font-semibold text-faint">Step {n + 1} of {total}</p>
      <h2 id={`step-${n}`} className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">{s.title}</h2>
      <p className="mt-2 max-w-2xl leading-relaxed text-graphite">{s.lead}</p>
      <div className="mt-5">{s.body}</div>
    </section>
  );
}
