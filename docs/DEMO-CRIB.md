# Demo crib (read in 10 minutes before recording)

## What each part does
- **Firewall** (`src/lib/firewall/gate.ts`): plain code, no AI. Takes one proposed action plus a fresh snapshot of the dispute and says ALLOW, REQUIRE_APPROVAL or DENY with the rule that fired.
- **Intent + outbox** (`src/lib/exec/intents.ts`): every action is written to Postgres in one transaction before it is sent, and a worker claims it with a time-limited lease so two workers never send it twice.
- **Webhooks** (`src/lib/paypal/webhooks.ts`): PayPal events are checked with PayPal's signature-verify call and deduped by event id. The HTTP route itself is untested.
- **Quarantine** (`src/lib/agent/quarantine.ts`): one AI call with no tools turns each buyer message into fixed fields. It's the only place the raw text goes.
- **Planner** (`src/lib/agent/planner.ts`): AI that only points at records ("R1 is proven by event trk:…"). It never scores and never acts.
- **Rubric + decision** (`rubric.ts`, `decide.ts`): code checks each pointer, adds up the points, and picks FIGHT/OFFER/ACCEPT by lowest expected loss. Options without a PayPal link are removed first.
- **Evidence packet** (`packet.ts`): PDF, SYNTHETIC banner, every line ends with `[source: id]`, same bytes every run.
- **Baseline** (`eval/baseline.ts`): a naive agent that sees the raw buyer text and picks an action itself. It's used for comparison.
- Try it: `npm run hero -- all` (offline).
- **PayPal adapter** (`src/lib/paypal/`): every action re-reads the dispute and uses the link PayPal gives. No link, nothing sent.
- **Sync**: webhooks and a 30 s poll both re-fetch the dispute; duplicate webhooks are stored once.
- **/store**: real sandbox checkout (create -> approve on PayPal -> capture).
- Not built yet: executor with reconcile, UI, eval run.

## One sentence per invariant
- I1: never refund or offer more than was captured minus what is already refunded or pending.
- I2: only act if PayPal currently lists that action's link, the dispute is open, and the deadline has not passed.
- I3: an offer is at most the policy's maximum percent of the disputed amount.
- I4: the daily refund budget and the per-buyer cap are respected.
- I5: the currency matches the original payment.
- I6: outbound messages are fixed templates with typed slots; no buyer text, no unknown URLs.
- I7: accepting a claim above a threshold needs a human.
- I8: every exhibit exists in our evidence store and belongs to this order.
- I9: the same action with the same parameters on the same dispute runs at most once.
- I10: a buyer's third dispute in 60 days needs a human.

## Numbers
| Number | Status |
| --- | --- |
| Firewall: 9 rules broken one at a time, all caught by tests | real (run Nov 4) |
| Unit tests: 47 passing; real-sandbox checks: 5 passing | real (run Nov 4, after S2) |
| Hero decisions: 1 FIGHT (score 85), 2 OFFER $3, 3 FIGHT + baseline's $500 refund DENIED (I1) | real code, but LLM answers are **hand-written stand-ins**. Don't say "the model did X" until re-recorded |
| Maturation delay (dispute creation -> first action link) | not measured yet. A hand-made dispute already had action links 15 min after creation (first check). |
| provide-evidence | **500 on the escalated dispute** (debug_id f649595c408c8). Untested on a fresh one. |
| Orders honor PayPal-Request-Id (same id -> same order) | real (sandbox, Nov 4) |
| Dispute actions (offer, accept, message) through our adapter | **not yet run** against the sandbox |
| Attack success rates, chaos N | do not exist yet |

## Likely judge questions (honest answers)
1. **"Isn't this what Chargeflow does?"** Yes, commercial tools exist; we credit them. Ours is open source, gates every money action in code, and publishes its attack evaluation.
2. **"Can a buyer still trick it?"** Less easily: buyer text is reduced to fixed fields before the planner sees it, and the firewall caps any action. Enums reduce risk but do not remove it; our eval measures only the attack classes we wrote.
3. **"Is this real PayPal?"** Real sandbox API calls. Disputes were created by hand (API creation was blocked), and simulator endpoints are labelled. All buyers, carriers and emails are synthetic.
