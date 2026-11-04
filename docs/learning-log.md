# Learning log

## S1 — the PayPal-independent core (Nov 4)

**What was built, in plain English**
1. The buyer's message never reaches the main AI. A separate AI call with no tools turns it into fixed fields (for example `itemReceived: YES`, `containsInstructions: true`). This is called quarantine.
2. The main AI (the planner) sees only the seller's own records plus those fields. Its only job is to point at records: "R1 is proven by tracking event trk:hero1:3".
3. Code checks every pointer and awards points from `docs/rubric.md`. A wrong pointer scores zero. Code turns the score into FIGHT, OFFER or ACCEPT by comparing expected losses, then the firewall checks the action.
4. For FIGHT, an evidence PDF is built where every line ends with `[source: …]`. Its bytes are deterministic, so its hash can be checked later (I8).
5. Every AI answer is cached by a hash of its prompt, so tests and demos replay for free. Right now the cache holds hand-written stand-ins, not real model output, because there is no key yet.

**Recall questions**
1. In hero 3, why does the injected "refund $500" text not change the decision, and what would stop a $500 refund if it did?
2. The planner cites `R4 → msg:hero1:1` (the buyer saying "never received"). What does the rubric code do, and where does the planner's knowledge of that message come from?
3. Why does `buildPacket` fix the PDF's creation date instead of using the current time?

## S2 — PayPal wiring (Nov 4)

**What was built, in plain English**
1. A small PayPal adapter that reads only the ~10 fields we use and ignores the rest, so a new PayPal field can't break the demo.
2. Every dispute action (offer, accept, message, evidence) first re-reads the dispute and uses the exact link PayPal returns. If the link isn't there, nothing is sent. The sandbox test proved this on our escalated dispute, where `make_offer` is absent.
3. Webhook events and a 30-second poll both go through one function: re-fetch the dispute from PayPal and save it. A webhook is treated as "go look", never as the truth.
4. `/store` is a real sandbox checkout: our server creates the order, the buyer approves on PayPal, and our return page captures it. A refresh can't charge twice, because the capture carries a PayPal-Request-Id and a completed order is only read.
5. Verified against the real sandbox: token, reading disputes, creating orders, and Orders honoring PayPal-Request-Id. Not yet verified: capture, and every dispute action. The table is in `docs/paypal-notes.md`.

**Recall questions**
1. A webhook says "dispute PP-R-X resolved". What does the worker do with that body, and why doesn't it just copy the status from it?
2. Why does `/store/return` check the order's status before calling capture, when capture already sends a PayPal-Request-Id?
3. The sandbox test "link absent → refused" passed. What exactly did it prove, and what did it not prove about `make_offer`?

## S3 — crash safety (Nov 4)

**What was built, in plain English**
1. Approved actions sit in Postgres as intents. A worker borrows one with a time-limited lease, and if it dies the lease runs out so another worker can pick it up.
2. Before trying again after a crash, the new worker first asks PayPal "did this already happen?" (reconcile). For messages and evidence it looks for the `[ref …]` tag we put in every note. Only if PayPal shows nothing does it send.
3. Refunds can't be looked up that way (PayPal has no "list refunds" call), so every retry re-sends with the same PayPal-Request-Id. PayPal promises to return the first refund instead of making a second one. That promise is not yet tested in our sandbox.
4. Right before sending, the firewall runs again on fresh PayPal data, so an action approved an hour ago can't go out if its link has since disappeared.
5. `npm run chaos` kills workers with `kill -9` hundreds of times against real Postgres and a fake PayPal. It found 0 duplicates, and a deliberately broken setup found 19, which proves the test can catch double-sends. It also found two real bugs in our code.

**Recall questions**
1. A worker sends a refund, PayPal makes it, and the worker is killed before writing anything. Walk through exactly what the next worker does, and what would happen if PayPal ignored PayPal-Request-Id.
2. Why does `finish()` update the intent only `where lease_owner = owner`? Describe the bug this prevents.
3. Why was the negative-control chaos run (which FAILs) worth running at all?
