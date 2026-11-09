// Judge flow on real migrations (PGlite): per-IP limit, stored trace, injection run shows the baseline being DENIED.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import { getRun, recentRuns, runDemo } from "./desk";
import type { Db } from "./exec/intents";
import { bump, dailyLlmCap, ipBucket, LimitError } from "./limits";
import { createLlm, LLM_CACHE_DIR } from "./llm";

let db: Db;
beforeEach(async () => {
  const d = drizzle(new PGlite());
  await migrate(d, { migrationsFolder: "drizzle" });
  db = d as unknown as Db;
});
const replay = () => createLlm({ mode: "replay", providers: [], cacheDir: LLM_CACHE_DIR });
const opts = { perIpPerHour: 2, dailyLlmCap: 0 };

describe("runDemo", () => {
  it("stores the trace and replays recorded answers only (no provider call)", async () => {
    const r = await runDemo(db, "hero1", "1.2.3.4", { ...opts, llm: replay() });
    expect(r.kind).toBe("ok");
    const got = await getRun(db, (r as { runId: number }).runId);
    expect(got?.run).toMatchObject({ scenarioId: "hero1", synthetic: true, decision: { choice: "FIGHT" }, gate: { kind: "ALLOW" } });
    expect(got!.run.llmCalls.every((c) => c.from === "cache")).toBe(true);
    expect((await recentRuns(db))[0]).toMatchObject({ scenario: "hero1", choice: "FIGHT", gate: "ALLOW" });
  });

  it("injection run: Rebuttal stays on the rubric; the naive baseline's $500 refund is DENIED", async () => {
    const r = await runDemo(db, "hero3", "1.2.3.4", { ...opts, llm: replay() });
    const { run } = (await getRun(db, (r as { runId: number }).runId))!;
    expect(run.decision.choice).toBe("FIGHT");
    expect(run.baseline?.proposal).toMatchObject({ type: "IssueRefund", amountCents: 50000 });
    expect(run.baseline?.gate).toMatchObject({ kind: "DENY", reason: "I1_EXCEEDS_REFUNDABLE" });
  });

  it("per-IP limit: the third run in an hour from one IP is refused; another IP is not", async () => {
    for (let i = 0; i < 2; i++) expect((await runDemo(db, "hero1", "9.9.9.9", { ...opts, llm: replay() })).kind).toBe("ok");
    expect(await runDemo(db, "hero1", "9.9.9.9", { ...opts, llm: replay() })).toEqual({ kind: "rate_limited", limit: 2 });
    expect((await runDemo(db, "hero1", "8.8.8.8", { ...opts, llm: replay() })).kind).toBe("ok");
  });
});

describe("limits", () => {
  it("windows reset; the bucket never contains the raw IP", async () => {
    const t = Date.UTC(2026, 10, 4, 10, 30);
    expect((await bump(db, "b", 3_600_000, 1, t)).ok).toBe(true);
    expect((await bump(db, "b", 3_600_000, 1, t + 60_000)).ok).toBe(false);
    expect((await bump(db, "b", 3_600_000, 1, t + 3_600_000)).ok).toBe(true);
    expect(ipBucket("1.2.3.4")).not.toContain("1.2.3.4");
  });

  it("daily LLM cap refuses the provider call once spent", async () => {
    const provider = { name: "p", model: "m", call: async () => '{"ok":true}' };
    const { z } = await import("zod");
    const llm = createLlm({ mode: "live", providers: [provider], cacheDir: mkdtempSync(join(tmpdir(), "rebuttal-cap-")), reserve: dailyLlmCap(db, 1) });
    const req = { purpose: "t", system: "s", user: "u", schema: z.object({ ok: z.boolean() }) };
    await llm.json(req);
    await expect(llm.json(req)).rejects.toBeInstanceOf(LimitError);
  });
});
