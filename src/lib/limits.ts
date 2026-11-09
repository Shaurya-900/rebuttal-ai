// Fixed-window counters in Postgres: the per-IP "Run demo" limit and the shared daily LLM cap.
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./exec/intents";

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

/** Adds one to `bucket` in the current window and says whether it is still within `limit`. One atomic upsert. */
export async function bump(db: Db, bucket: string, windowMs: number, limit: number, nowMs = Date.now()): Promise<{ ok: boolean; count: number }> {
  const start = new Date(Math.floor(nowMs / windowMs) * windowMs).toISOString();
  const r = await db.execute(sql`
    insert into usage_counter (bucket, window_start, count) values (${bucket}, ${start}, 1)
    on conflict (bucket, window_start) do update set count = usage_counter.count + 1
    returning count`);
  const count = Number((r as unknown as { rows: { count: number }[] }).rows[0]!.count);
  return { ok: count <= limit, count };
}

export class LimitError extends Error {}

/** Throws LimitError once the day's provider calls exceed `cap`. Pass to llmFromEnv as `reserve`. */
export const dailyLlmCap = (db: Db, cap: number) => async () => {
  if (!(await bump(db, "llm:global", DAY, cap)).ok) throw new LimitError(`daily LLM cap of ${cap} calls reached`);
};

/** We never store a raw IP: only a salted hash, enough to tell callers apart for one rate-limit window. */
export function ipBucket(ip: string, salt = process.env.RATE_LIMIT_SALT ?? "rebuttal"): string {
  return `run:${createHash("sha256").update(`${salt}|${ip}`).digest("hex").slice(0, 16)}`;
}
