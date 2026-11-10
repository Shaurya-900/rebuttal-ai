// The seller's policy, editable on /desk/policy. Every change is one row in the append-only event_log (kind 'policy'),
// so the history is the audit trail and the newest row is the current policy. No row yet -> DEFAULT_POLICY.
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "./exec/intents";
import { DEFAULT_POLICY, type Policy } from "./firewall/types";

const cents = z.coerce.number().int().min(0).max(10_000_000);
export const PolicySchema = z.object({
  maxOfferPct: z.coerce.number().int().min(0).max(100),
  autoAcceptMaxCents: cents,
  dailyRefundBudgetCents: cents,
  perBuyerCap30dCents: cents,
  repeatDisputerThreshold: z.coerce.number().int().min(1).max(20),
  // Hostnames only: I6 lets outbound messages link to these and nothing else.
  messageUrlAllowlist: z.array(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/)).max(10),
}) satisfies z.ZodType<Policy>;

export type PolicyRow = { id: number; at: string; policy: Policy };

export async function policyHistory(db: Db, n = 10): Promise<PolicyRow[]> {
  const r = await db.execute(sql`select id, at, data from event_log where kind = 'policy' order by id desc limit ${n}`);
  return (r as unknown as { rows: { id: number; at: Date | string; data: unknown }[] }).rows.flatMap((row) => {
    const p = PolicySchema.safeParse(row.data);
    return p.success ? [{ id: Number(row.id), at: new Date(row.at).toISOString(), policy: p.data }] : []; // a bad row is skipped, never used
  });
}

export async function currentPolicy(db: Db): Promise<{ policy: Policy; since: string | null }> {
  const [latest] = await policyHistory(db, 1);
  return latest ? { policy: latest.policy, since: latest.at } : { policy: DEFAULT_POLICY, since: null };
}

/** Validates and appends. Throws a ZodError on bad input; nothing is written then. */
export async function savePolicy(db: Db, input: unknown): Promise<Policy> {
  const p = PolicySchema.parse(input);
  await db.execute(sql`insert into event_log (dispute_id, kind, data) values (null, 'policy', ${JSON.stringify(p)}::jsonb)`);
  return p;
}
