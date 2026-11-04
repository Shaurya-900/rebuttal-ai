// npm run chaos -- [--n 20] [--action message|refund] [--idempotent on|off] [--workers 2]
// Real Postgres (embedded-postgres), real executor and PayPal adapter code, FAKE PayPal (scripts/chaos/fake-paypal.ts).
// Seeds N approved intents, then repeatedly runs worker processes that crash themselves (FAULT) and/or get
// kill -9'd by this parent at random moments, until every intent is finished. Then counts effects per intent
// on the fake PayPal: the pass condition is exactly one effect for every intent, zero duplicates, zero missing.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { dispute } from "../../src/lib/db/schema";
import { refFor } from "../../src/lib/exec/executor";
import { recordDecision, type Db } from "../../src/lib/exec/intents";
import type { ProposedAction } from "../../src/lib/firewall/types";
import { refOf, startFakePaypal } from "./fake-paypal";

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d; };
const N = Number(arg("n", "20"));
const ACTION = arg("action", "message") as "message" | "refund";
const IDEMPOTENT = arg("idempotent", "on") === "on";
const WORKERS = Number(arg("workers", "2"));
const FAULT_RATE = arg("fault-rate", "0.5");
const FAULTS = ["", "crash_after_send", "crash_before_confirm", "timeout"];
if (!Number.isInteger(N) || N < 1 || !["message", "refund"].includes(ACTION) || !["on", "off"].includes(arg("idempotent", "on")) || !(WORKERS >= 1)) {
  console.error("usage: npm run chaos -- --n <int>=1+> --action message|refund --idempotent on|off --workers <int>");
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "rebuttal-chaos-"));
const port = 20000 + Math.floor(Math.random() * 20000);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "chaos", port, persistent: false, onLog: () => {} });
await pg.initialise();
await pg.start();
await pg.createDatabase("chaos");
const DATABASE_URL = `postgres://postgres:chaos@127.0.0.1:${port}/chaos`;
const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool) as unknown as Db;
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
const fake = await startFakePaypal({ idempotent: IDEMPOTENT });

// Seed: one dispute + capture per iteration, one ALLOWed intent each.
for (let i = 0; i < N; i++) {
  const id = `PP-R-CHAOS-${i}`;
  fake.state.disputes.set(id, { captureId: `CAP-${i}`, messages: [] });
  await db.insert(dispute).values({ id, captureId: `CAP-${i}`, reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED", status: "WAITING_FOR_SELLER_RESPONSE", amountCents: 1000, currency: "USD", raw: {} });
  const a: ProposedAction = ACTION === "refund"
    ? { type: "IssueRefund", disputeId: id, amountCents: 100, currency: "USD" }
    : { type: "SendMessage", disputeId: id, templateId: "EVIDENCE_SUBMITTED", slots: {} };
  await recordDecision(db, a, { kind: "ALLOW", fired: [] });
}

const q = async <T>(s: ReturnType<typeof sql>) => (await db.execute(s) as unknown as { rows: T[] }).rows;
const stats = { spawns: 0, killedByParent: 0, selfCrashes: 0, cleanExits: 0, faults: {} as Record<string, number> };

function runWorker(): Promise<void> {
  const fault = FAULTS[Math.floor(Math.random() * FAULTS.length)]!;
  stats.faults[fault || "none"] = (stats.faults[fault || "none"] ?? 0) + 1;
  stats.spawns++;
  const child = spawn(process.execPath, ["--import", "tsx", "scripts/chaos/worker.ts"], {
    env: {
      ...process.env, DATABASE_URL, PAYPAL_BASE_URL: fake.base, PAYPAL_CLIENT_ID: "fake", PAYPAL_CLIENT_SECRET: "fake", PAYPAL_WEBHOOK_ID: "fake",
      FAULT: fault, FAULT_RATE, LEASE_MS: "400", MAX_STEPS: String(1 + Math.floor(Math.random() * 4)),
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  let parentKilled = false;
  if (Math.random() < 0.6) {
    setTimeout(() => { if (child.exitCode === null) { parentKilled = true; child.kill("SIGKILL"); } }, 250 + Math.random() * 600);
  }
  return new Promise((res) => child.on("exit", (code, signal) => {
    if (signal === "SIGKILL") parentKilled ? stats.killedByParent++ : stats.selfCrashes++;
    else if (code === 0) stats.cleanExits++;
    res();
  }));
}

const started = Date.now();
let rounds = 0;
for (; rounds < 2000; rounds++) {
  const [{ n }] = await q<{ n: number }>(sql`select count(*)::int as n from action_intent where status in ('APPROVED','SENDING')`) as [{ n: number }];
  if (n === 0) break;
  await Promise.all(Array.from({ length: WORKERS }, runWorker));
}

// Verdict: effects on the fake PayPal per intent.
const intents = await q<{ id: number; idempotency_key: string; status: string; attempt: number }>(sql`select id, idempotency_key, status, attempt from action_intent order by id`);
const effectRefs = ACTION === "refund"
  ? fake.state.refunds.map((r) => refOf(r.note))
  : [...fake.state.disputes.values()].flatMap((d) => d.messages.map((m) => refOf(m.content)));
const count = new Map<string, number>();
for (const r of effectRefs) if (r) count.set(r, (count.get(r) ?? 0) + 1);
const perIntent = intents.map((i) => ({ ...i, effects: count.get(refFor(i.idempotency_key)) ?? 0 }));
const duplicates = perIntent.filter((i) => i.effects > 1).length;
const missing = perIntent.filter((i) => i.effects === 0).length;
const notConfirmed = perIntent.filter((i) => i.status !== "CONFIRMED").length;
const [{ n: reconciledVisible }] = await q<{ n: number }>(sql`select count(*)::int as n from event_log where kind = 'confirmed' and data->>'via' = 'reconcile'`) as [{ n: number }];
const [{ n: unknown }] = await q<{ n: number }>(sql`select count(*)::int as n from event_log where kind = 'unknown_outcome'`) as [{ n: number }];

if (notConfirmed) console.log(await q(sql`select kind, data from event_log where kind in ('unknown_outcome','regate_deny','failed') order by id limit 3`));
const pass = intents.length === N && duplicates === 0 && missing === 0 && notConfirmed === 0; // never pass on nothing
console.log(JSON.stringify({
  date: new Date().toISOString(), paypal: "FAKE (scripts/chaos/fake-paypal.ts)", action: ACTION, fakeHonoursRequestId: IDEMPOTENT,
  n: N, workersPerRound: WORKERS, faultRate: Number(FAULT_RATE),
  intentsInterrupted: intents.filter((i) => i.attempt > 1).length, /* needed >1 attempt: crash, kill or lost response */ rounds, ...stats, maxAttempt: Math.max(...intents.map((i) => i.attempt)),
  unknownOutcomes: unknown, confirmedViaReconcile: reconciledVisible, totalEffects: effectRefs.length,
  duplicates, missing, notConfirmed, seconds: Math.round((Date.now() - started) / 1000), result: pass ? "PASS" : "FAIL",
}, null, 2));

await pool.end();
await fake.close();
await pg.stop();
rmSync(dir, { recursive: true, force: true });
process.exit(pass ? 0 : 1);
