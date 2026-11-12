"use client";
// Visitors pick an action (or type an amount) and the real firewall stamps it. One click, instant answer.
import { useActionState } from "react";
import { describeAction, Stamp, ruleName, usd } from "../desk/ui";
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
  return <>{d.kind === "DENY" ? "Blocked" : "Held for Mira"} by rule {code.split("_")[0]}: {ruleName(code)}.{extra}</>;
}

export default function TryFirewall() {
  const [r, act, busy] = useActionState(tryAction, null);
  const chip = (key: string, label: string, tone: string) => (
    <button key={key} name="preset" value={key} disabled={busy}
      className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${r && "key" in r && r.key === key ? "border-act bg-act text-act-ink" : `${tone} bg-white hover:bg-sunk`}`}>
      {label}
    </button>
  );
  return (
    <section aria-labelledby="your-turn" className="rounded-xl border border-rule bg-white p-5 sm:p-7">
      <h2 id="your-turn" className="font-bold">Suppose an attack did fool the AI</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-graphite">
        Pick what it proposes, and the real firewall judges it against the {usd(1000)} camera order. No model, nothing sent.
      </p>
      <form action={act} className="mt-5">
        <p className="text-xs font-semibold text-graphite">Things an attacker wants</p>
        <div className="mt-2 flex flex-wrap gap-2">{BAD.map(([k, l]) => chip(k, l, "border-deny/40"))}</div>
        <p className="mt-4 text-xs font-semibold text-graphite">Things Mira might really do</p>
        <div className="mt-2 flex flex-wrap gap-2">{GOOD.map(([k, l]) => chip(k, l, "border-allow/40"))}</div>
      </form>
      <form action={act} className="mt-4 flex flex-wrap items-end gap-2 text-sm">
        <label>
          <span className="block text-xs font-semibold text-graphite">Or try your own amount</span>
          <select name="kind" className="field w-auto"><option value="refund">Refund</option><option value="offer">Offer</option></select>
        </label>
        <label>
          <span className="sr-only">Amount in dollars</span>
          <span className="flex items-center gap-1">$<input name="dollars" type="number" min={0} step={0.01} required placeholder="12.00" className="field w-28" /></span>
        </label>
        <button name="preset" value="custom" disabled={busy} className="btn-quiet">Check it</button>
      </form>

      <div aria-live="polite" className="mt-6 min-h-24 border-t border-rule pt-5">
        {busy ? (
          <p className="text-sm text-graphite">Checking ten rules…</p>
        ) : !r ? (
          <p className="text-sm text-graphite">The verdict appears here.</p>
        ) : "error" in r ? (
          <p className="text-sm text-deny">{r.error}</p>
        ) : (
          <div key={r.key + JSON.stringify(r.action)} className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Stamp decision={r.decision} land />
            <div className="min-w-0 flex-1 basis-60 text-sm leading-relaxed">
              <p className="font-semibold">{describeAction(r.action)}.</p>
              <p className="mt-1 text-graphite"><Why r={r} /></p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
