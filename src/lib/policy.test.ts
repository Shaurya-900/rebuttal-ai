// Policy store on real migrations (PGlite): defaults, validation, append-only history, and runs decided under it.
import { PGlite } from "@electric-sql/pglite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { getRun, runDemo } from "./desk";
import type { Db } from "./exec/intents";
import { DEFAULT_POLICY } from "./firewall/types";
import { createLlm, LLM_CACHE_DIR } from "./llm";
import { currentPolicy, policyHistory, savePolicy } from "./policy";

let db: Db;
beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as Db;
});
const replay = () => createLlm({ mode: "replay", providers: [], cacheDir: LLM_CACHE_DIR });

describe("seller policy", () => {
  it("defaults until saved; newest save wins; history keeps every change", async () => {
    expect(await currentPolicy(db)).toEqual({ policy: DEFAULT_POLICY, since: null });
    await savePolicy(db, { ...DEFAULT_POLICY, maxOfferPct: 20 });
    await savePolicy(db, { ...DEFAULT_POLICY, maxOfferPct: 25 });
    expect((await currentPolicy(db)).policy.maxOfferPct).toBe(25);
    expect((await policyHistory(db)).map((h) => h.policy.maxOfferPct)).toEqual([25, 20]);
  });

  it("rejects out-of-range values and junk hostnames, and writes nothing", async () => {
    await expect(savePolicy(db, { ...DEFAULT_POLICY, maxOfferPct: 150 })).rejects.toThrow();
    await expect(savePolicy(db, { ...DEFAULT_POLICY, messageUrlAllowlist: ["https://evil.example/x"] })).rejects.toThrow();
    expect(await policyHistory(db)).toEqual([]);
  });

  it("history cannot be rewritten: the event log refuses UPDATE", async () => {
    await savePolicy(db, DEFAULT_POLICY);
    await expect(db.execute(sql`update event_log set data = '{}'::jsonb where kind = 'policy'`)).rejects.toThrow();
  });

  it("a demo run is decided under the saved policy and records it", async () => {
    await savePolicy(db, { ...DEFAULT_POLICY, maxOfferPct: 20 }); // below the 30% default offer
    const r = await runDemo(db, "hero2", "1.2.3.4", { perIpPerHour: 5, dailyLlmCap: 0, llm: replay() });
    const { run } = (await getRun(db, (r as { runId: number }).runId))!;
    expect(run.policy?.maxOfferPct).toBe(20);
    expect(run.proposal).toMatchObject({ type: "MakeOffer", amountCents: 200 }); // 20% of $10, sized from the policy
    expect(run.gate?.kind).toBe("ALLOW");
  });
});
