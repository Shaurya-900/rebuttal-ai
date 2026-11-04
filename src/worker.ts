// Worker process (a separate Render service): drains webhook events every 5 s and polls PayPal every 30 s.
// The executor (S3) and agent runs will join this loop.
import { env } from "./env";
import { getDb } from "./lib/db/client";
import { getDispute, listDisputesUpdatedSince } from "./lib/paypal/disputes";
import { pollOnce, processWebhooks } from "./lib/paypal/sync";

env(); // fail fast on bad config
const db = getDb();
// ponytail: cursor lives in memory; after a restart we re-poll 30 days, which is cheap and idempotent.
let cursor = new Date(Date.now() - 30 * 86_400_000).toISOString();
let lastPoll = 0;

for (;;) {
  try {
    const n = await processWebhooks(db, getDispute);
    if (n) console.log(`webhooks processed: ${n}`);
    if (Date.now() - lastPoll >= 30_000) {
      cursor = await pollOnce(db, cursor, listDisputesUpdatedSince, getDispute);
      lastPoll = Date.now();
    }
  } catch (e) {
    console.error("worker loop error:", e instanceof Error ? e.message : e); // no bodies or tokens in logs
  }
  await new Promise((r) => setTimeout(r, 5000));
}
