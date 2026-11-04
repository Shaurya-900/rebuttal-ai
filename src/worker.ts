// Worker process (a separate Render service): executes approved intents, drains webhook events every 5 s and
// polls PayPal every 30 s. Agent runs will join this loop.
import { randomUUID } from "node:crypto";
import { env } from "./env";
import { getDb } from "./lib/db/client";
import { executeNext } from "./lib/exec/executor";
import { paypalEffects } from "./lib/exec/paypal-effects";
import { DEFAULT_POLICY } from "./lib/firewall/types";
import { getDispute, listDisputesUpdatedSince } from "./lib/paypal/disputes";
import { pollOnce, processWebhooks } from "./lib/paypal/sync";

env(); // fail fast on bad config
const db = getDb();
const owner = `worker-${process.pid}-${randomUUID().slice(0, 8)}`;
// Lease (30 s) is 3x the request timeout (10 s): a live worker never loses its lease mid-request.
const fx = paypalEffects(db, { timeoutMs: 10_000 });
const execOpts = { policy: DEFAULT_POLICY, now: Date.now, leaseMs: 30_000, maxAttempts: 5, retryAfterMs: 15_000 };
// ponytail: cursor lives in memory; after a restart we re-poll 30 days, which is cheap and idempotent.
let cursor = new Date(Date.now() - 30 * 86_400_000).toISOString();
let lastPoll = 0;

for (;;) {
  try {
    for (let i = 0; i < 10; i++) {
      const r = await executeNext(db, owner, fx, execOpts);
      if (r.kind === "idle") break;
      console.log(`intent ${r.intentId}: ${r.kind}${"reason" in r ? ` ${r.reason}` : ""}${"error" in r ? ` ${r.error}` : ""}`);
    }
    const n = await processWebhooks(db, getDispute);
    if (n) console.log(`webhooks processed: ${n}`);
    if (Date.now() - lastPoll >= 30_000) {
      cursor = await pollOnce(db, cursor, listDisputesUpdatedSince, getDispute);
      lastPoll = Date.now();
    }
  } catch (e) {
    console.error("worker loop error:", e instanceof Error ? e.message : e); // no bodies or tokens in logs
  }
  await new Promise((r) => setTimeout(r, 2000));
}
