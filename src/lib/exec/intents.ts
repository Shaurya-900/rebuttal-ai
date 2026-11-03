// Gate decision -> durable intent. Intent + outbox + event_log row are written in one transaction.
import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { actionKey, moneyCents } from "../firewall/gate";
import type { Decision, ProposedAction } from "../firewall/types";
import { actionIntent, eventLog, outbox } from "../db/schema";

export type Db = PgDatabase<PgQueryResultHKT>;

/**
 * Records every decision in event_log. ALLOW -> APPROVED intent + outbox row; REQUIRE_APPROVAL -> PROPOSED intent;
 * DENY -> log only. Returns the intent id, or null when DENYed or when the same (dispute, action, params) already exists (I9).
 */
export async function recordDecision(db: Db, action: ProposedAction, decision: Decision): Promise<number | null> {
  return db.transaction(async (tx) => {
    await tx.insert(eventLog).values({ disputeId: action.disputeId, kind: "gate_decision", data: { action, decision } });
    if (decision.kind === "DENY") return null;
    const key = actionKey(action);
    const paramsHash = key.split("|")[2]!;
    const [row] = await tx
      .insert(actionIntent)
      .values({
        disputeId: action.disputeId,
        actionType: action.type,
        params: action,
        paramsHash,
        amountCents: moneyCents(action),
        status: decision.kind === "ALLOW" ? "APPROVED" : "PROPOSED",
        gateDecision: decision,
        idempotencyKey: key,
      })
      .onConflictDoNothing()
      .returning({ id: actionIntent.id });
    if (!row) {
      await tx.insert(eventLog).values({ disputeId: action.disputeId, kind: "duplicate_intent", data: { key } });
      return null;
    }
    if (decision.kind === "ALLOW") await tx.insert(outbox).values({ intentId: row.id });
    return row.id;
  });
}

export type Claimed = { id: number; disputeId: string; actionType: string; params: unknown; attempt: number; idempotencyKey: string };

/**
 * Claims one sendable intent with a lease. attempt > 1 means a previous worker died mid-send:
 * the executor MUST reconcile against PayPal before sending again (CLAUDE.md Pillar 2).
 */
export async function claimNext(db: Db, owner: string, leaseMs: number): Promise<Claimed | null> {
  const r = await db.execute(sql`
    with next as (
      select i.id from outbox o join action_intent i on i.id = o.intent_id
      where o.processed_at is null and o.available_at <= now()
        and (i.status = 'APPROVED' or (i.status = 'SENDING' and i.lease_expires_at < now()))
      order by o.id
      limit 1
      for update of i skip locked
    )
    update action_intent i
    set status = 'SENDING', lease_owner = ${owner}, lease_expires_at = now() + ${leaseMs} * interval '1 millisecond',
        attempt = i.attempt + 1, updated_at = now()
    from next where i.id = next.id
    returning i.id, i.dispute_id, i.action_type, i.params, i.attempt, i.idempotency_key`);
  const row = (r as unknown as { rows: Record<string, unknown>[] }).rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    disputeId: String(row.dispute_id),
    actionType: String(row.action_type),
    params: row.params,
    attempt: Number(row.attempt),
    idempotencyKey: String(row.idempotency_key),
  };
}
