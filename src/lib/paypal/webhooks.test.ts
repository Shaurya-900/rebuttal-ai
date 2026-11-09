import { beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { ingestWebhook } from "./webhooks";
import type { Db } from "../exec/intents";

let db: Db;
beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as Db;
});

const ev = { id: "WH-1", event_type: "CUSTOMER.DISPUTE.CREATED", resource: { dispute_id: "PP-D-1", extra: true }, extra: 1 };
const ok = async () => true;

describe("webhook ingestion", () => {
  it("stores a verified event once; a replay is acknowledged but not stored again (A6)", async () => {
    expect(await ingestWebhook(db, ev, ok)).toEqual({ status: 200, stored: true });
    expect(await ingestWebhook(db, ev, ok)).toEqual({ status: 200, stored: false });
  });

  it("rejects unverified and malformed events", async () => {
    expect(await ingestWebhook(db, ev, async () => false)).toEqual({ status: 401, stored: false });
    expect(await ingestWebhook(db, { event_type: "X" }, ok)).toEqual({ status: 400, stored: false });
  });
});
