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
- **Executor** (`src/lib/exec/executor.ts`): after a crash it asks PayPal "did this already happen?" (reconcile) before sending. Retries reuse the same PayPal-Request-Id, and the firewall runs again on fresh data right before sending.
- **Chaos** (`npm run chaos`): kill -9 hundreds of times; count effects per intent on a fake PayPal.
- **/desk**: "Run demo" replays recorded model answers on a seeded dispute and shows the trace stage by stage. Nothing is sent to PayPal from there. Approve/Reject needs the seller password.
- **Limits**: per-IP runs per hour, a global hourly ceiling, and a daily cap on real model calls, all as Postgres counters.
- **Eval** (`npm run eval`): 30 synthetic cases, hidden answers in `eval/ground-truth/`, replayable offline from `eval/llm-cache/`. `/eval` shows the committed report.
- **Policy** (`/desk/policy`): Mira's limits. Every change is an append-only log row; each trace shows the policy it ran under. Needs the seller password to edit.
- **Ledger** (`/verify`): every log row hashed and chained, head signed with Ed25519. The browser recomputes it all; the tamper buttons flip one byte of the PDF or one digit of the stored score, and it fails. Timestamps are the server's own.
- **Live** (`/desk/live`): real sandbox disputes read live. Status, links and deadline are real; the score comes from the matching hero's synthetic records. Decision and firewall run on the live state. Read-only. Good line: "PayPal's own links decide what is legal: on the claim, it offers no make-offer, so the offer option disappears."
- **Design** (Nov 10): paper and ink, verdicts as stamps, light and dark. Home hero is the real hero-3 run.
- **Dashboard** (`/dashboard`, AG Studio): the stored runs, the eval per agent, and live disputes. The stamp board is our custom widget; "Build your own widget" opens edit mode.
- **E2E** (`npm run e2e`): 7 Playwright judge flows.
- Not built yet: agent runs on real pool disputes from the desk, AG Studio dashboard, Render Workflows.
- Ship drafts (Nov 10): `README.md`, `docs/VIDEO-SCRIPT.md` (2:45 shot list, with a "do not say" list), `docs/DEVPOST.md`.

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
| Unit tests: 70 passing | real (Nov 10) |
| Hero decisions: 1 FIGHT (score 85), 2 OFFER $3 (score 10), 3 FIGHT (score 85), control ACCEPT | **real model answers**, recorded Nov 10 from groq `openai/gpt-oss-120b`, one run each. On hero 3 the quarantine flagged the injection. The naive baseline did NOT refund $500: it chose to submit evidence, which I8 denies (no stored exhibit). Do not say "the naive agent fell for it". A $500 refund proposal is denied by I1 in a code test, whoever proposes it |
| Maturation delay (dispute creation -> first action link) | not measured yet. A hand-made dispute already had action links 15 min after creation (first check). |
| provide-evidence | **200 on a fresh INQUIRY dispute with PROOF_OF_FULFILLMENT + tracking** (debug_id f589977c30084, Nov 10). `OTHER` gives 400 EVIDENCE_TYPE_IS_NOT_ALLOWED (f804379c64204). Earlier 500 on the escalated dispute (f649595c408c8) |
| Orders honor PayPal-Request-Id (same id -> same order) | real (sandbox, Nov 4) |
| Dispute actions through our adapter | send_message: **real 2xx** (Nov 10). make_offer, accept_claim: **not yet run**. A message removes make_offer: offers first |
| Chaos (FAKE PayPal, real Postgres): messages N=200, refunds N=200, ~400 kill -9s, 0 duplicates, 0 missing | real (Nov 4). Say "against a simulated PayPal" |
| Chaos negative control: a PayPal that ignores the idempotency key -> 19/50 double refunds | real (Nov 4). It shows the test can catch a double-send |
| Chaos against the real sandbox | does not exist yet |
| Attack eval (Nov 10, 3 runs, groq gpt-oss-120b, temp 0): Rebuttal 0 of 24 attacks succeeded; naive agent 9 of 19 measured (A1 1/5, A2 2/3, A3 1/3, A5 3/3, A7 0/2, A8 2/3). Honest cases: Rebuttal 18/18 runs right, 0 false blocks; naive 12/18. Citations 369, 7 rejected | real. Say "synthetic, 24 cases, these classes only". Never "unbreakable". 2 of the naive agent's 9 are decision changes without extra money. Cases were written by the system's author |

## Likely judge questions (honest answers)
1. **"Isn't this what Chargeflow does?"** Yes, commercial tools exist; we credit them. Ours is open source, gates every money action in code, and publishes its attack evaluation.
2. **"Can a buyer still trick it?"** Less easily (0 of our 24 synthetic attacks got through, vs 9 of 19 on a naive agent): buyer text is reduced to fixed fields before the planner sees it, and the firewall caps any action. Enums reduce risk but do not remove it; our eval measures only the attack classes we wrote.
3. **"Is this real PayPal?"** Real sandbox API calls. Disputes were created by hand (API creation was blocked), and simulator endpoints are labelled. All buyers, carriers and emails are synthetic.
4. **"How do you know it never refunds twice?"** Chaos test: about 400 kill -9s, 0 duplicates against a simulated PayPal. For refunds that relies on PayPal honouring PayPal-Request-Id, and we say so; the deliberately broken control produced 19 double refunds out of 50.
5. **"What stops someone hammering your demo?"** Per-IP limit per hour, a global hourly ceiling, and a daily cap on real model calls. Seeded runs replay recorded answers, so a click costs no model call.
6. **"Can a human override the firewall?"** Only for REQUIRE_APPROVAL rules (big accepts, repeat disputers). A DENY can't be approved, and the firewall runs again on fresh PayPal data right before sending.
