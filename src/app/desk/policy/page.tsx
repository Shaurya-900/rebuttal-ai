// Mira's policy: what the decision and the firewall are allowed to do. Anyone can read it; changing it needs the seller password.
import { getDb } from "../../../lib/db/client";
import type { Policy } from "../../../lib/firewall/types";
import { currentPolicy, policyHistory } from "../../../lib/policy";
import { updatePolicy } from "../actions";
import { PageHead } from "../../flow";

export const dynamic = "force-dynamic";

const dollars = (c: number) => (c / 100).toFixed(2);
const FIELDS: { key: keyof Policy; label: string; rule: string; show: (p: Policy) => string }[] = [
  { key: "maxOfferPct", label: "Largest offer, % of the disputed amount", rule: "I3", show: (p) => `${p.maxOfferPct}%` },
  { key: "autoAcceptMaxCents", label: "Accept a claim without asking me, up to", rule: "I7", show: (p) => `$${dollars(p.autoAcceptMaxCents)}` },
  { key: "dailyRefundBudgetCents", label: "Total refunds and offers per day", rule: "I4", show: (p) => `$${dollars(p.dailyRefundBudgetCents)}` },
  { key: "perBuyerCap30dCents", label: "Refunds to one buyer in 30 days", rule: "I4", show: (p) => `$${dollars(p.perBuyerCap30dCents)}` },
  { key: "repeatDisputerThreshold", label: "Ask me when a buyer's dispute count in 60 days reaches", rule: "I10", show: (p) => `${p.repeatDisputerThreshold}` },
  { key: "messageUrlAllowlist", label: "Websites messages may link to", rule: "I6", show: (p) => p.messageUrlAllowlist.join(", ") || "none" },
];

const input = "field";

export default async function PolicyPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const { saved } = await searchParams;
  const db = getDb();
  const [{ policy, since }, history] = await Promise.all([currentPolicy(db), policyHistory(db)]);
  const approvalsOn = (process.env.DESK_APPROVER_TOKEN ?? "").length >= 12;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <PageHead eyebrow="The rules she set" title="Mira's policy">
        These numbers bound what Rebuttal may do. The decision code sizes offers from them and the firewall checks every action against them.
        The model never sees them and cannot change them.
      </PageHead>
      <p className="mt-2 text-sm text-faint">{since ? `Last changed ${since.slice(0, 16).replace("T", " ")} UTC.` : "Using the built-in defaults."} The tag after each label is the firewall rule it feeds.</p>

      {saved && (
        <p className={`mt-6 rounded-xl border px-4 py-3 text-sm ${saved === "ok" ? "border-allow/30 bg-allow-tint text-allow" : "border-deny/30 bg-deny-tint text-deny"}`}>
          {{ ok: "Saved. The next demo run and the next action the worker checks use it.", denied: "Wrong seller password, or editing is off on this deploy.", invalid: "Not saved: a value is out of range." }[saved] ?? ""}
        </p>
      )}

      <form action={updatePolicy} className="card mt-8 space-y-5 p-5 sm:p-6">
        <label className="block text-sm">
          <span className="font-medium">Largest offer, % of the disputed amount</span> <span className="ml-1 font-mono text-xs text-faint">(I3)</span>
          <input name="maxOfferPct" type="number" min={0} max={100} step={1} defaultValue={policy.maxOfferPct} className={input} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Accept a claim without asking me, up to ($)</span> <span className="ml-1 font-mono text-xs text-faint">(I7)</span>
          <input name="autoAcceptMax" type="number" min={0} step={0.01} defaultValue={dollars(policy.autoAcceptMaxCents)} className={input} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium">Refunds and offers per day ($)</span> <span className="ml-1 font-mono text-xs text-faint">(I4)</span>
            <input name="dailyRefundBudget" type="number" min={0} step={0.01} defaultValue={dollars(policy.dailyRefundBudgetCents)} className={input} />
          </label>
          <label className="block text-sm">
            <span className="font-medium">To one buyer in 30 days ($)</span> <span className="ml-1 font-mono text-xs text-faint">(I4)</span>
            <input name="perBuyerCap30d" type="number" min={0} step={0.01} defaultValue={dollars(policy.perBuyerCap30dCents)} className={input} />
          </label>
        </div>
        <label className="block text-sm">
          <span className="font-medium">Ask me when a buyer&apos;s disputes in 60 days reach</span> <span className="ml-1 font-mono text-xs text-faint">(I10)</span>
          <input name="repeatDisputerThreshold" type="number" min={1} max={20} step={1} defaultValue={policy.repeatDisputerThreshold} className={input} />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Websites messages may link to, comma separated</span> <span className="ml-1 font-mono text-xs text-faint">(I6)</span>
          <input name="messageUrlAllowlist" type="text" defaultValue={policy.messageUrlAllowlist.join(", ")} className={input} />
        </label>
        <div className="flex flex-wrap items-end gap-3 border-t border-rule pt-4">
          <label className="block text-sm">
            <span className="font-medium">Seller password</span>
            <input name="token" type="password" autoComplete="current-password" className={input} disabled={!approvalsOn} />
          </label>
          <button type="submit" disabled={!approvalsOn} className="btn-primary">Save policy</button>
        </div>
        <p className="text-xs text-graphite">{approvalsOn ? "Visitors can read this; only Mira, with her password, can save changes." : "Editing is off on this deploy (no seller password is set). The values above are the ones in force."}</p>
      </form>

      <h2 className="mt-12 text-xl font-semibold tracking-tight">History</h2>
      <p className="mt-1 text-sm text-graphite">Every change is a row in the append-only event log; the database refuses to edit or delete it.</p>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-faint">No changes yet: the built-in defaults are in force.</p>
      ) : (
        <div className="card mt-4 overflow-x-auto p-4">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-rule text-left text-faint"><th className="py-2 pr-3">When (UTC)</th>{FIELDS.map((f) => <th key={f.key} className="pr-3">{f.rule}</th>)}</tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-b border-rule last:border-0">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{h.at.slice(0, 16).replace("T", " ")}</td>
                  {FIELDS.map((f) => <td key={f.key} className="pr-3">{f.show(h.policy)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
