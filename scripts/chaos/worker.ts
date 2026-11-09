// One chaos worker process: drain intents until idle, with injected faults. The parent may also kill -9 it.
//   FAULT=crash_after_send | crash_before_confirm | timeout   FAULT_RATE=0..1
import { randomUUID } from "node:crypto";
import { getDb } from "../../src/lib/db/client";
import { executeNext, type FaultPoint } from "../../src/lib/exec/executor";
import { paypalEffects } from "../../src/lib/exec/paypal-effects";
import { DEFAULT_POLICY } from "../../src/lib/firewall/types";

const fault = process.env.FAULT ?? "";
const rate = Number(process.env.FAULT_RATE ?? "0.5");
const owner = `chaos-${process.pid}-${randomUUID().slice(0, 6)}`;
const db = getDb();
const fx = paypalEffects(db, { timeoutMs: fault === "timeout" ? 15 : 10_000 });

const crash = (p: FaultPoint) => {
  if (p === fault && Math.random() < rate) process.kill(process.pid, "SIGKILL"); // a real kill -9 of ourselves
};

// Short lives: each process handles at most MAX_STEPS intents, so kills land on many different intents.
const maxSteps = Number(process.env.MAX_STEPS ?? Infinity);
let idle = 0;
let steps = 0;
while (idle < 3 && steps < maxSteps) {
  const r = await executeNext(db, owner, fx, {
    policy: DEFAULT_POLICY, now: Date.now, leaseMs: Number(process.env.LEASE_MS ?? 400), maxAttempts: 25, retryAfterMs: 50, fault: crash,
  });
  idle = r.kind === "idle" ? idle + 1 : 0;
  if (r.kind !== "idle") steps++;
  if (r.kind === "idle") await new Promise((res) => setTimeout(res, 150));
}
process.exit(0);
