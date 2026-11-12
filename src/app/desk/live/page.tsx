// Real PayPal sandbox disputes, read-only: what Rebuttal would do on each, and what the firewall says. Nothing is sent.
import Link from "next/link";
import { getDb } from "../../../lib/db/client";
import { liveRecommendations, type LiveRec } from "../../../lib/live";
import { currentPolicy } from "../../../lib/policy";
import { Badge, displayTitle, Stamp, usd } from "../ui";
import { liveQueue } from "../../../lib/desk";
import { answer } from "../actions";
import { SCENARIOS } from "../../../lib/agent/scenarios";
import { NextStep } from "../../flow";

export const dynamic = "force-dynamic";

const REASON: Record<string, string> = {
  MERCHANDISE_OR_SERVICE_NOT_RECEIVED: "Item not received",
  MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED: "Not as described",
};
const ACTION_LABEL: Record<string, string> = { provide_evidence: "send evidence", make_offer: "make an offer", accept_claim: "accept", send_message: "message the buyer", escalate: "escalate (PayPal simulator)" };
const PROPOSAL: Record<string, string> = { SubmitEvidence: "Send the evidence packet", MakeOffer: "Offer", AcceptClaim: "Accept and refund" };
const status = (s: string) => s.replaceAll("_", " ").toLowerCase();

function Dispute({ r }: { r: LiveRec }) {
  const allowed = r.links.filter((l) => l !== "self");
  return (
    <article className="border-t border-rule py-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 className="text-lg font-bold">{REASON[r.reason] ?? status(r.reason)}, {usd(r.amountCents)}</h2>
        <span className="id">{r.id}</span>
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-graphite">Status at PayPal</dt>
        <dd>{status(r.status)}{r.stage ? `, ${r.stage.toLowerCase()} stage` : ""}</dd>
        <dt className="text-graphite">PayPal allows now</dt>
        <dd>{allowed.length ? allowed.map((l) => ACTION_LABEL[l] ?? l).join(", ") : "nothing"}</dd>
        <dt className="text-graphite">Seller must answer by</dt>
        <dd>{r.dueIso ? `${r.dueIso.slice(0, 16).replace("T", " ")} UTC` : "no deadline right now"}</dd>
        <dt className="text-graphite">Buyer messages</dt>
        <dd>{r.buyerMessages} on file, not read on this page</dd>
        <dt className="text-graphite">Scored on</dt>
        <dd>
          {r.template
            ? <>synthetic records from <Link className="link" href="/desk">{displayTitle(SCENARIOS[r.template]?.title ?? r.template)}</Link>: rubric {r.score} of 100</>
            : "no matching records, so not scored"}
        </dd>
      </dl>

      <div className="mt-5">
        {r.waitingOn ? (
          <p className="text-sm"><span className="font-semibold">Rebuttal would wait.</span> {r.waitingOn}</p>
        ) : r.decision && r.proposal && r.gate ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
            <div className="text-sm">
              <p className="font-semibold">
                Rebuttal would: {PROPOSAL[r.proposal.type] ?? r.proposal.type}
                {"amountCents" in r.proposal ? ` (${usd(r.proposal.amountCents)})` : ""}
              </p>
              {r.decision.removed.length > 0 && (
                <p className="mt-1 text-graphite">Not considered, because PayPal does not allow it now: {r.decision.removed.map((c) => c.toLowerCase()).join(", ")}.</p>
              )}
            </div>
            <Stamp decision={r.gate} />
          </div>
        ) : (
          <p className="text-sm text-graphite">No recommendation.</p>
        )}
      </div>
    </article>
  );
}

export default async function Live({ searchParams }: { searchParams: Promise<{ approval?: string }> }) {
  const { approval } = await searchParams;
  const db = getDb();
  const [{ policy }, live] = await Promise.all([currentPolicy(db), liveQueue(db)]);
  const res = await liveRecommendations(policy);
  const approvalsOn = (process.env.DESK_APPROVER_TOKEN ?? "").length >= 12;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">Real sandbox disputes</h1>
      <p className="mt-3 leading-relaxed text-graphite">
        These disputes were opened by hand on real PayPal sandbox payments. Their status, deadline and the actions PayPal allows are read live,
        and the decision and firewall run on that live state. Nothing is sent from this page.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-graphite">
        The sandbox gives a seller no records of its own, so each dispute is scored on the synthetic records of the matching demo case, from recorded
        model answers. The buyer&apos;s real messages are not read here, because that would need a live model call.
      </p>

      {!res.ok ? (
        <p className="mt-8 rounded border border-deny/30 bg-deny-tint px-4 py-3 text-sm text-deny">
          PayPal&apos;s sandbox did not answer ({res.error}). Try again in a minute; nothing else on the site depends on it.
        </p>
      ) : res.items.length === 0 ? (
        <p className="mt-8 text-sm text-graphite">No sandbox disputes were updated in the last 30 days. Open one from the store to see it here.</p>
      ) : (
        <div className="mt-8">{res.items.map((r) => <Dispute key={r.id} r={r} />)}</div>
      )}
      {approval && (
        <p role="status" className="mt-6 rounded border border-rule bg-sunk px-3 py-2 text-sm">
          {{ approved: "Approved. The worker re-checks the firewall against PayPal's current state before sending.", rejected: "Rejected. Nothing will be sent.", stale: "That action was already answered.", denied: "Wrong approver password, or approvals are off on this deploy." }[approval] ?? ""}
        </p>
      )}
      {live.pending.length > 0 && (
        <section aria-labelledby="waiting" className="mt-10">
          <h2 id="waiting" className="text-lg font-bold tracking-tight">Waiting for the seller</h2>
          <p className="mt-1 text-sm text-graphite">Actions on these disputes that the firewall held for Mira&apos;s approval. Approval never overrides a denial.</p>
          <ul className="mt-3 space-y-2">
            {live.pending.map((p) => (
              <li key={p.id} className="rounded border border-rule p-4 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{p.action_type}</strong>
                  {"amountCents" in p.params && <span>{usd(p.params.amountCents)}</span>}
                  <span className="text-graphite">on {p.dispute_id}</span>
                  <Badge tone="amber">{p.gate_decision.kind === "REQUIRE_APPROVAL" ? p.gate_decision.rule : "re-check"}</Badge>
                </div>
                {approvalsOn ? (
                  <form action={answer} className="mt-3 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="intentId" value={p.id} />
                    <input type="password" name="token" required placeholder="Approver password" aria-label="Approver password" className="field mt-0 w-auto min-w-0" />
                    <button name="answer" value="approve" className="btn-quiet border-allow/40 text-allow">Approve</button>
                    <button name="answer" value="reject" className="btn-quiet">Reject</button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-graphite">Approvals are off on this deploy (no approver password set).</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="mt-6 text-xs text-faint">Read from PayPal at {res.fetchedAt.slice(11, 16)} UTC, refreshed at most once a minute.</p>
      <NextStep href="/dashboard" action="See everything in the dashboard">
        Every run, every attack and these live disputes, in one dashboard you can rearrange or add to.
      </NextStep>
    </main>
  );
}
