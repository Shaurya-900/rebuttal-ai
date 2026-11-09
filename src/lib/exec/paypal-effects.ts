// The executor's view of PayPal: fresh snapshot, per-action reconcile, send.
// Reconcile strategies (how we tell "already happened" from "never happened" after a crash):
//   SendMessage    -> a SELLER message containing our [ref] tag            (state check)
//   SubmitEvidence -> a SUBMITTED_BY_SELLER evidence whose notes carry [ref] (state check)
//   AcceptClaim    -> dispute status RESOLVED                              (state check)
//   MakeOffer      -> dispute has an `offer` and no make_offer link         (state check, shape UNVERIFIED)
//   IssueRefund    -> re-send with the same PayPal-Request-Id               (idempotency key; v2 cannot list refunds)
import { inArray, sql } from "drizzle-orm";
import { exhibit } from "../db/schema";
import type { Currency, ProposedAction, Snapshot } from "../firewall/types";
import { disputeSnapshot, getDispute, sendDisputeAction, type Attachment, type PaypalDispute } from "../paypal/disputes";
import { getCapture, refundCapture } from "../paypal/orders";
import type { Effects, Reconciled } from "./executor";
import type { Db } from "./intents";

const rows = <T>(r: unknown) => (r as { rows: T[] }).rows;

export function reconcileFromDispute(a: ProposedAction, d: PaypalDispute, ref: string): Reconciled {
  const tag = `[ref ${ref}]`;
  switch (a.type) {
    case "SendMessage":
      return { visible: (d.messages ?? []).some((m) => m.posted_by === "SELLER" && (m.content ?? "").includes(tag)), how: "seller message with ref tag" };
    case "SubmitEvidence":
      return { visible: (d.evidences ?? []).some((e) => e.source === "SUBMITTED_BY_SELLER" && (e.notes ?? "").includes(tag)), how: "seller evidence with ref tag" };
    case "AcceptClaim":
      return { visible: d.status === "RESOLVED", how: "dispute RESOLVED" };
    case "MakeOffer":
      return { visible: !!d.offer && !d.links.some((l) => l.rel === "make_offer"), how: "offer present, make_offer link gone (UNVERIFIED shape)" };
    case "IssueRefund":
    case "AskSeller":
      return { visible: false, how: "idempotency-key" };
  }
}

/** Everything the snapshot needs from our own database. Exported so it is tested on real migrations. */
export async function localState(db: Db, disputeId: string, intentId: number) {
  const [row] = rows<{ capture_id: string | null; buyer_payer_id: string | null }>(await db.execute(sql`select capture_id, buyer_payer_id from dispute where id = ${disputeId}`));
  const buyer = row?.buyer_payer_id ?? null;
  // ponytail: refund totals come only from our own intents; refunds made outside Rebuttal are invisible here
  // (v2 has no refund list). Upgrade: Transaction Search API, which lags by hours.
  const [sums] = rows<Record<string, string>>(await db.execute(sql`
    select
      coalesce(sum(amount_cents) filter (where status = 'CONFIRMED' and dispute_id = ${disputeId}), 0) as refunded,
      coalesce(sum(amount_cents) filter (where status = 'SENDING' and dispute_id = ${disputeId}), 0) as pending,
      coalesce(sum(amount_cents) filter (where status in ('CONFIRMED','SENDING') and updated_at > now() - interval '1 day'), 0) as today,
      coalesce(sum(amount_cents) filter (where status in ('CONFIRMED','SENDING') and updated_at > now() - interval '30 days'
        and dispute_id in (select id from dispute where buyer_payer_id = ${buyer})), 0) as buyer30
    from action_intent where action_type in ('MakeOffer', 'AcceptClaim', 'IssueRefund') and id <> ${intentId}`));
  const [cnt] = rows<{ n: string }>(await db.execute(sql`select count(*) as n from dispute where buyer_payer_id = ${buyer} and updated_at > now() - interval '60 days'`));
  const executed = new Set(rows<{ k: string }>(await db.execute(sql`
    select dispute_id || '|' || action_type || '|' || params_hash as k from action_intent where status in ('CONFIRMED','SENDING') and id <> ${intentId}`)).map((r) => r.k));
  const ex = rows<{ id: string; order_id: string; sha256: string; h: string }>(await db.execute(sql`
    select id, order_id, sha256, encode(sha256(bytes), 'hex') as h from exhibit where dispute_id = ${disputeId}`));
  return {
    captureId: row?.capture_id ?? null,
    refundedCents: Number(sums!.refunded),
    pendingRefundCents: Number(sums!.pending),
    refundsTodayCents: Number(sums!.today),
    refundsToBuyer30dCents: Number(sums!.buyer30),
    buyerDisputes60d: buyer ? Number(cnt!.n) : 1,
    executed,
    evidenceStore: new Map(ex.map((e) => [e.id, { orderId: e.order_id, sha256: e.sha256 }])),
    // The hash is recomputed by Postgres from the stored bytes, i.e. the bytes we are about to upload (I8).
    exhibitBytesSha256: new Map(ex.map((e) => [e.id, e.h])),
  };
}

export function paypalEffects(db: Db, o: { timeoutMs?: number } = {}): Effects {
  return {
    async snapshot(a, intentId): Promise<Snapshot> {
      const d = await getDispute(a.disputeId);
      const { captureId, ...local } = await localState(db, a.disputeId, intentId);
      const cap = captureId ? await getCapture(captureId) : null;
      return {
        ...local,
        dispute: disputeSnapshot(d, captureId ?? a.disputeId),
        capture: { amountCents: cap?.amountCents ?? NaN, currency: (cap?.currency ?? d.dispute_amount.currency_code) as Currency }, // no capture -> fail closed
      };
    },

    async reconcile(a, ref) {
      if (a.type === "IssueRefund") return { visible: false, how: "idempotency-key" };
      return reconcileFromDispute(a, await getDispute(a.disputeId), ref);
    },

    async send(a, ref, requestId) {
      if (a.type === "IssueRefund") {
        const { captureId } = await localState(db, a.disputeId, -1);
        if (!captureId) throw new Error(`no capture id for ${a.disputeId}`);
        const r = await refundCapture({ captureId, amountCents: a.amountCents, currency: a.currency, ref, requestId, timeoutMs: o.timeoutMs });
        return { paypalRef: r.id };
      }
      let attachments: Attachment[] = [];
      if (a.type === "SubmitEvidence") {
        attachments = (await db.select({ name: exhibit.name, bytes: exhibit.bytes }).from(exhibit).where(inArray(exhibit.id, a.exhibitIds)))
          .map((e) => ({ name: e.name, bytes: new Uint8Array(e.bytes), contentType: "application/pdf" as const }));
      }
      const r = await sendDisputeAction(a, { attachments, requestId, ref, timeoutMs: o.timeoutMs });
      return { paypalRef: r.res.debugId };
    },
  };
}
