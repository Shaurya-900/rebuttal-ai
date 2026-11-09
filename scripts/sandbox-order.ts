// Verifies order create -> buyer approve -> capture against the real sandbox.
//   npm run sandbox:order [amount-in-cents]
// You approve in your browser as the sandbox BUYER (we never automate PayPal's login). The script polls the
// order until it is APPROVED, captures it, and prints the capture id (needed later to open a dispute by hand).
import { randomUUID } from "node:crypto";
import { captureOrder, createOrder, getOrder } from "../src/lib/paypal/orders";

const amountCents = Number(process.argv[2] ?? 1000);
const runId = randomUUID();
const { order, approveUrl } = await createOrder({
  amountCents,
  currency: "USD",
  description: "SYNTHETIC Rebuttal test order",
  returnUrl: "https://example.com/return",
  cancelUrl: "https://example.com/cancel",
  requestId: `create-${runId}`,
});
console.log(`order ${order.id} status ${order.status}`);
console.log(`\nOpen this, log in as the sandbox BUYER, and approve:\n${approveUrl}\n`);
console.log("(After approving you land on example.com; that is expected.) Waiting up to 10 minutes...");

const deadline = Date.now() + 10 * 60_000;
let status = order.status;
while (status !== "APPROVED" && Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 5000));
  status = (await getOrder(order.id)).status;
  process.stdout.write(`.${status === "APPROVED" ? " approved\n" : ""}`);
}
if (status !== "APPROVED") { console.log(`\nnot approved (status ${status}); stopping`); process.exit(1); }

const first = await captureOrder(order.id, `capture-${runId}`);
console.log(`captured: capture id ${first.captureId}, status ${first.status}`);
// Idempotency check: the same PayPal-Request-Id must return the same capture, not a second charge.
const again = await captureOrder(order.id, `capture-${runId}`);
console.log(`re-capture with same PayPal-Request-Id -> capture id ${again.captureId} (${again.captureId === first.captureId ? "SAME: idempotent" : "DIFFERENT: NOT idempotent"})`);
