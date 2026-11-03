// Runs the real migrations on PGlite (Postgres in WASM) — no external database needed.
import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { sql } from "drizzle-orm";
import { dispute } from "../db/schema";
import { claimNext, recordDecision, type Db } from "./intents";
import type { ProposedAction } from "../firewall/types";

let db: Db;
const allow = { kind: "ALLOW" as const, fired: [] };
const offer: ProposedAction = { type: "MakeOffer", disputeId: "PP-D-1", amountCents: 300, currency: "USD", offerType: "REFUND" };

beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  await d.insert(dispute).values({ id: "PP-D-1", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE",
    amountCents: 1000, currency: "USD", raw: {} });
  db = d as unknown as Db;
});

const count = async (table: string) =>
  Number(((await db.execute(sql.raw(`select count(*)::int as n from ${table}`))) as unknown as { rows: { n: number }[] }).rows[0]!.n);

describe("intents", () => {
  it("ALLOW writes intent + outbox + log; the same action twice is stored once (I9)", async () => {
    expect(await recordDecision(db, offer, allow)).toBeTypeOf("number");
    expect(await recordDecision(db, { ...offer }, allow)).toBeNull();
    expect(await count("action_intent")).toBe(1);
    expect(await count("outbox")).toBe(1);
    expect(await count("event_log")).toBe(3); // 2 decisions + 1 duplicate note
  });

  it("DENY is logged but never becomes an intent", async () => {
    expect(await recordDecision(db, offer, { kind: "DENY", reason: "I3_OFFER_OVER_CAP", fired: [] })).toBeNull();
    expect(await count("action_intent")).toBe(0);
    expect(await count("event_log")).toBe(1);
  });

  it("REQUIRE_APPROVAL is stored but not claimable", async () => {
    await recordDecision(db, offer, { kind: "REQUIRE_APPROVAL", rule: "I10", fired: [] });
    expect(await claimNext(db, "w1", 30_000)).toBeNull();
  });

  it("a claimed intent is leased; an expired lease is re-claimable with attempt 2", async () => {
    await recordDecision(db, offer, allow);
    const first = await claimNext(db, "w1", 30_000);
    expect(first).toMatchObject({ attempt: 1, actionType: "MakeOffer" });
    expect(await claimNext(db, "w2", 30_000)).toBeNull(); // lease held
    await db.execute(sql`update action_intent set lease_expires_at = now() - interval '1 second'`);
    expect(await claimNext(db, "w2", 30_000)).toMatchObject({ id: first!.id, attempt: 2 });
  });

  it("event_log is append-only", async () => {
    await recordDecision(db, offer, allow);
    await expect(db.execute(sql`update event_log set kind = 'x'`)).rejects.toThrow();
    await expect(db.execute(sql`delete from event_log`)).rejects.toThrow();
  });
});
