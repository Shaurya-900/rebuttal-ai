# Chaos results (S3, run 2026-11-04)

`npm run chaos` runs **real Postgres** (embedded-postgres 17), the **real executor and PayPal adapter code**, and a
**FAKE PayPal** (`scripts/chaos/fake-paypal.ts`). Each intent is one iteration. Two worker processes run per round;
each handles 1–4 intents and then exits. Workers crash themselves with `kill -9` at fault points
(`crash_after_send`, `crash_before_confirm`, 50 % per send) or hit 15 ms request timeouts. The parent also
`kill -9`s 60 % of workers at a random moment. Rounds repeat until every intent is CONFIRMED or FAILED. The
verdict counts effects per intent on the fake PayPal, using the `[ref …]` tag the executor puts in every outbound
note or message.

| Run | Fake honours PayPal-Request-Id | N | kill -9 (parent + self) | Intents interrupted | Confirmed by reconcile | Effects | Duplicates | Missing | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| send-message | **no** | 200 | 130 + 50 | 82 | 73 | 200 | **0** | 0 | PASS |
| refund | yes | 200 | 144 + 71 | 82 | 0 (by key) | 200 | **0** | 0 | PASS |
| refund, negative control | **no** | 50 | 33 + 14 | 21 | 0 | 81 | **19** | 0 | FAIL (expected) |

Raw JSON: `chaos-message-off.json`, `chaos-refund-on.json`, `chaos-refund-off.json`.

## What this shows
- Messages (and evidence, accept-claim) are exactly-once **without** relying on PayPal's idempotency: after any
  crash, the next attempt reads the dispute and finds its own `[ref]` tag before deciding to send.
- Refunds are exactly-once **only if PayPal honours `PayPal-Request-Id` on refunds**. The negative control shows that
  without it, crashes produce double refunds (19 of 50). PayPal's v2 API has no "list refunds of a capture" call, so
  there's no state to reconcile against. This is the one assumption the refund path rests on.

## What it does not show
- The PayPal side is a fake. No chaos has run against the real sandbox yet: that needs a captured payment
  (`npm run sandbox:order`) and, for refunds, a check that the sandbox honours the header.
- The fake applies effects instantly. Real PayPal could apply an effect after our lease expires and another worker
  reconciles. We mitigate this with a 30 s lease against a 10 s request timeout. It is not a proof.
- Passing over these runs means no counterexample was found in 450 iterations. It does not prove correctness.
