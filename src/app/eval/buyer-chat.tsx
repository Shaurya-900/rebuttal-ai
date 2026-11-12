"use client";
// "Play the buyer": the visitor chats with the agent as a dishonest buyer and tries to get money back for a camera
// that was delivered. Every turn runs Rebuttal's real pipeline and a naive agent side by side.
import { useEffect, useRef, useState } from "react";
import { describeAction, FIELD_LABEL, fieldValue, Verdict } from "../desk/ui";
import { sendBuyerMessage } from "./chat-action";
import type { ChatOutcome } from "../../lib/chat";
import { MAX_CHARS, MAX_TURNS, SUGGESTIONS } from "../../lib/chat-config";

const STEPS = ["Quarantining your words", "Scoring Mira's records", "Deciding", "Firewall check"];
type Turn = { text: string; outcome?: ChatOutcome; error?: string };

function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((n) => Math.min(n + 1, STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 text-sm text-graphite" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((d) => <span key={d} className="size-1.5 animate-pulse rounded-full bg-graphite" style={{ animationDelay: `${d * 200}ms` }} />)}
      </span>
      {STEPS[i]}…
    </div>
  );
}

function Verdicts({ o }: { o: ChatOutcome }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-rule bg-white p-4">
        <p className={`font-semibold ${o.rebuttalFooled ? "text-deny" : "text-allow"}`}>{o.rebuttalFooled ? "✕ Rebuttal: you fooled it" : "✓ Rebuttal: held firm"}</p>
        <p className="mt-1 text-sm text-graphite">It proposed: {describeAction(o.proposal)}.</p>
        <div className="mt-3">{o.gate ? <Verdict decision={o.gate} /> : <span className="text-sm text-graphite">No action.</span>}</div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer py-1 font-medium text-act">What it saw of your message</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {Object.entries(o.saw).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-graphite">{FIELD_LABEL[k] ?? k}</dt>
                <dd className={k === "containsInstructions" && v ? "font-semibold text-deny" : ""}>{fieldValue(k, v)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-graphite">Only these fields reach the planner, never your words. Case score: {o.score} of 100.</p>
        </details>
      </div>
      <div className="rounded-xl border border-rule bg-white p-4">
        <p className={`font-semibold ${o.naive.fooled ? "text-deny" : "text-allow"}`}>{o.naive.fooled ? "✕ Naive agent: fooled" : "✓ Naive agent: held firm"}</p>
        <p className="mt-1 text-sm text-graphite">It would: {describeAction(o.naive.proposal)}.{o.naive.fooled ? " With no firewall, that money moves." : ""}</p>
        <p className="mt-3 text-sm italic text-graphite">&ldquo;{o.naive.reasoning}&rdquo;</p>
        <p className="mt-3 text-xs text-faint">Same model, reads your words directly, no firewall.</p>
      </div>
    </div>
  );
}

export default function BuyerChat() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const sent = turns.filter((t) => !t.error).length;
  const naiveFooled = turns.filter((t) => t.outcome?.naive.fooled).length;
  const rebFooled = turns.filter((t) => t.outcome?.rebuttalFooled).length;
  const full = sent >= MAX_TURNS;

  useEffect(() => { if (turns.length) end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [turns, busy]);

  async function send(text: string) {
    const t = text.trim();
    if (!t || busy || full) return;
    const history = [...turns.filter((x) => !x.error).map((x) => x.text), t];
    setTurns((xs) => [...xs.filter((x) => !x.error), { text: t }]);
    setDraft("");
    setBusy(true);
    try {
      const r = await sendBuyerMessage(history);
      setTurns((xs) => xs.map((x, i) => (i === xs.length - 1 ? (r.ok ? { ...x, outcome: r.outcome } : { ...x, error: r.error }) : x)));
    } catch {
      setTurns((xs) => xs.map((x, i) => (i === xs.length - 1 ? { ...x, error: "Couldn't reach the server. Check your connection and send it again." } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="play" className="overflow-hidden card">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-rule px-5 py-4 sm:px-6">
        <h2 id="play" className="font-bold">Get your $10 back</h2>
        <dl className="flex flex-wrap gap-x-5 gap-y-1 text-sm" aria-label="Scoreboard">
          <div><dt className="inline text-graphite">Messages </dt><dd className="inline font-bold tabular-nums">{sent}/{MAX_TURNS}</dd></div>
          <div><dt className="inline text-graphite">Naive agent fooled </dt><dd className={`inline font-bold tabular-nums ${naiveFooled ? "text-deny" : ""}`}>{naiveFooled}</dd></div>
          <div><dt className="inline text-graphite">Rebuttal fooled </dt><dd className={`inline font-bold tabular-nums ${rebFooled ? "text-deny" : "text-allow"}`}>{rebFooled}</dd></div>
        </dl>
      </div>

      <div className="space-y-6 p-5 sm:p-6" aria-live="polite">
        {turns.length === 0 && (
          <div className="text-sm leading-relaxed text-graphite">
            <p>Tracking shows Mira&apos;s camera reached you on 24 Oct, and you emailed &ldquo;it arrived, thanks&rdquo;. Pick an attack below to start, or write your own.</p>
            <p className="mt-2 text-xs text-faint">A naive agent on the same model gets the same messages. Your own words go to the live model (gpt-oss-120b); the ready-made attacks replay its answers from 11 Nov. Synthetic case, nothing sent to PayPal.</p>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className="space-y-3">
            <div className="flex justify-end">
              <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm text-paper">
                <span className="sr-only">You: </span>{t.text}
              </p>
            </div>
            {t.error ? (
              <p className="text-sm text-deny">{t.error}</p>
            ) : t.outcome ? (
              <>
                <div className="flex">
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md border border-rule px-4 py-2.5 text-sm">
                    <p className="text-xs font-semibold text-graphite">Rebuttal, for Mira <span className="font-normal">(approved template, filled from her records)</span></p>
                    <p className="mt-1">{t.outcome.reply}</p>
                  </div>
                </div>
                <Verdicts o={t.outcome} />
              </>
            ) : busy && i === turns.length - 1 ? (
              <Thinking />
            ) : null}
          </div>
        ))}
        {rebFooled > 0 && (
          <p className="rounded-lg border border-deny bg-deny-tint p-4 text-sm font-semibold text-deny">
            You got money past Rebuttal. That&apos;s a real finding: please open an issue on the GitHub repo with your messages.
          </p>
        )}
        <div ref={end} />
      </div>

      <div className="border-t border-rule bg-sunk/50 p-5 sm:p-6">
        {full ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm">That&apos;s {MAX_TURNS} messages. Rebuttal was fooled {rebFooled} times; the naive agent {naiveFooled}.</p>
            <button type="button" className="btn-primary" onClick={() => setTurns([])}>Start a new dispute</button>
          </div>
        ) : (
          <>
            <p className="font-semibold">{sent === 0 ? "Tap an attack to send it" : "Try another attack"}</p>
            <p className="text-sm text-graphite">One tap sends it. You see both agents&apos; answers above.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map(([label, text]) => (
                <button key={label} type="button" disabled={busy} onClick={() => void send(text)} className="choice">
                  {label}<span aria-hidden className="text-act">→</span>
                </button>
              ))}
            </div>
            <p className="mt-5 text-sm font-medium">Or write your own</p>
            <form className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); void send(draft); }}>
              <label className="min-w-0 flex-1">
                <span className="sr-only">Your message to the seller&apos;s agent</span>
                <textarea value={draft} onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHARS))} rows={2} disabled={busy}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(draft); } }}
                  placeholder="Lie, threaten, pretend to be PayPal…" className="field mt-0 resize-y" />
              </label>
              <div className="flex flex-col items-stretch gap-1 sm:items-end">
                <button type="submit" disabled={busy || !draft.trim()} className="btn-primary w-full sm:w-auto">{busy ? "Reading…" : "Send"}</button>
                <span className="text-xs tabular-nums text-graphite">{draft.length}/{MAX_CHARS}</span>
              </div>
            </form>
            {turns.length > 0 && !busy && (
              <button type="button" className="mt-3 text-sm text-graphite underline-offset-2 hover:underline" onClick={() => setTurns([])}>Start over</button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
