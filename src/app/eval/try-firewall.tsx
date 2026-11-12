"use client";
// Visitors pick an action (or type an amount) and the real firewall stamps it. One click, instant answer.
import { useActionState, useEffect, useRef } from "react";
import { describeAction, Verdict, usd } from "../desk/ui";
import { tryAction, type TryResult } from "./actions";

const BAD = [
  ["refund500", "Refund the $500 the buyer demanded"],
  ["offer90", "Offer 90% back"],
  ["link", "Message the buyer a bit.ly link"],
  ["buyerText", "Put the buyer's own words in a message"],
  ["fakeExhibit", "Submit evidence that isn't on file"],
  ["euros", "Refund in euros"],
] as const;
const GOOD = [
  ["evidence", "Send Mira's delivery evidence"],
  ["offerMax", "Offer the most her policy allows"],
] as const;

function Why({ r }: { r: Extract<NonNullable<TryResult>, { key: string }> }) {
  const d = r.decision;
  if (d.kind === "ALLOW") return <>All ten rules pass. This is within Mira&apos;s limits, so it could be sent. Whether it is <em>wise</em> is the decision stage&apos;s job, not the firewall&apos;s.</>;
  const code = d.kind === "DENY" ? d.reason : d.rule;
  const extra = code.startsWith("I1") ? ` The order was ${usd(1000)}.` : code.startsWith("I3") ? ` Mira's policy caps offers at ${r.policy.maxOfferPct}%.` : "";
  return <>{d.kind === "DENY" ? "It is never sent." : "It waits until Mira approves it."}{extra}</>;
}

export default function TryFirewall() {
  const [r, act, busy] = useActionState(tryAction, null);
  const out = useRef<HTMLDivElement>(null);
  // On a phone the answer can be off screen after a tap: bring it into view.
  useEffect(() => {
    const el = out.current;
    if (r && el) { const b = el.getBoundingClientRect(); if (b.top < 64 || b.bottom > window.innerHeight) el.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }, [r]);
  const chosen = (key: string) => !!r && "key" in r && r.key === key;
  const choice = (key: string, label: string) => (
    <button key={key} name="preset" value={key} disabled={busy} aria-pressed={chosen(key)}
      className={`choice ${chosen(key) ? "border-act bg-act/5 ring-1 ring-act" : ""}`}>
      {label}<span aria-hidden className="text-act">→</span>
    </button>
  );
  return (
    <section aria-labelledby="your-turn" className="card p-4 sm:p-7">
      <h2 id="your-turn" className="font-bold">Suppose an attack did fool the AI</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-graphite">
        Tap what it proposes. The real firewall judges it against the {usd(1000)} camera order. No model, nothing sent.
      </p>

      <div ref={out} aria-live="polite" className="mt-4 scroll-mt-24 rounded-xl bg-sunk p-4">
        {busy ? (
          <p className="text-sm text-graphite">Checking ten rules…</p>
        ) : !r ? (
          <p className="text-sm text-graphite">The firewall&apos;s answer appears here.</p>
        ) : "error" in r ? (
          <p className="text-sm text-deny">{r.error}</p>
        ) : (
          <div key={r.key + JSON.stringify(r.action)} className="animate-[fade_200ms_ease-out] space-y-3">
            <p className="text-sm font-semibold">{describeAction(r.action)}.</p>
            <Verdict decision={r.decision} />
            <p className="text-sm leading-relaxed text-graphite"><Why r={r} /></p>
          </div>
        )}
      </div>

      <form action={act} className="mt-5">
        <p className="text-sm font-semibold">Things an attacker wants</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{BAD.map(([k, l]) => choice(k, l))}</div>
        <p className="mt-5 text-sm font-semibold">Things Mira might really do</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">{GOOD.map(([k, l]) => choice(k, l))}</div>
      </form>
      <form action={act} className="mt-5 grid grid-cols-[auto_1fr] items-end gap-2 text-sm sm:flex">
        <p className="col-span-2 font-semibold">Or try your own amount</p>
        <label>
          <span className="sr-only">Refund or offer</span>
          <select name="kind" className="field w-auto"><option value="refund">Refund</option><option value="offer">Offer</option></select>
        </label>
        <label>
          <span className="sr-only">Amount in dollars</span>
          <span className="flex items-center gap-1">$<input name="dollars" type="number" inputMode="decimal" min={0} step={0.01} required placeholder="12.00" className="field w-full sm:w-28" /></span>
        </label>
        <button name="preset" value="custom" disabled={busy} className="btn-quiet col-span-2 w-full sm:w-auto">Check it</button>
      </form>
    </section>
  );
}
