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

## S4 — the desk (Nov 4)

**What was built, in plain English**
1. `/desk` lets a judge click "Run demo" on a made-up dispute. The agent runs with recorded model answers, so a click costs nothing and never touches PayPal.
2. The trace page shows each stage: the buyer's raw text beside the fixed fields it was reduced to, every rubric point with the record it came from, the decision, and what the firewall said.
3. For the injection demo it also shows a naive agent obeying "refund $500", and our firewall refusing that action (I1).
4. Actions that need a human show Approve/Reject buttons behind a seller password. While wiring them we found the executor treated every action as human-approved; now only a real approval counts.
5. Postgres counters cap runs per IP per hour and real model calls per day, so the public demo can't be run up.

**Recall questions**
1. An action was ALLOWed yesterday. Today it's the buyer's 3rd dispute (I10). What does the executor do now, and what did it do before this fix?
2. Why does the per-IP limit use the *last* X-Forwarded-For entry rather than the first?
3. A judge clicks Run demo 50 times. Why does that cost zero model calls, and what would make it start costing?

## M0 audit + M3 deploy files (Nov 10)
1. The repo was compared with `docs/MASTER-PROMPT.md` and wrote `docs/PROGRESS.md`: one line per milestone, saying what is done, partial or blocked.
2. Typecheck was failing because iCloud had made duplicate files ("name 2") inside `.next/`, the build cache. Deleting the cache fixed it; no source code was wrong.
3. `/api/health` is a tiny route that runs `select 1` on Postgres. Render calls it to decide whether the web service is alive. It answers 200 with a database and 503 without (both checked locally).
4. `render.yaml` is a "Blueprint": a file that tells Render to create the web service, the worker and the database. Secrets are marked `sync: false`, so Render asks for them in its dashboard and they never enter Git.
5. Nothing is deployed yet. The file is unverified until Render actually builds it.

Recall questions:
1. Why does the health route not check the worker as well as the database?
2. What does `sync: false` mean in `render.yaml`, and why does it matter for a public repo?
3. `PAYPAL_WEBHOOK_ID` is set to `pending` at first. What happens to a webhook that arrives before the real id is set, and why is that the safe direction?

## Policy, ledger, home page, browser tests (Nov 10)
1. The home page now states the three promises, and each one shows its measured result. The eval numbers are read from the committed report file, so the page can't drift from it.
2. `/desk/policy` lets the seller change her limits. Each change is a new row in the append-only log, so the history is the audit trail, and the newest row is the one in force. Every run records the policy it was decided under.
3. The ledger hashes every log row and chains each hash to the one before. The server signs the newest link with an Ed25519 key.
4. `/verify` makes the browser redo that maths itself (WebCrypto). Changing one byte of a PDF, or one digit of a stored score, makes it fail.
5. Playwright tests click through the judge flows in a real browser. The same tests can point at the live site with `BASE_URL`.

Recall questions:
1. Why does editing one old row break the signature check, even though only the newest link is signed?
2. Why are policy changes stored as new log rows instead of updating a single "policy" row?
3. What does `/verify` NOT prove about when a run happened, and why?

## Redesign and read-only live disputes (Nov 10)
1. The site now has one design system: paper and ink colours, light and dark modes, and the firewall's verdict drawn as a rubber stamp everywhere it appears.
2. The home page's top section is the real hero-3 run, computed from the recorded answers, not typed in: the attack, the fields the planner gets, and two stamps.
3. `/desk/live` reads the real sandbox disputes from PayPal with read-only calls and shows what Rebuttal would do on each.
4. Status, allowed actions and the deadline there are live. The score comes from the matching demo case's synthetic records, because the sandbox gives a seller no records.
5. It sends nothing on purpose: a public button would let any visitor use up the hand-made disputes during judging.

Recall questions:
1. On the escalated dispute, why does the offer option disappear, and which code removes it?
2. What on `/desk/live` is live from PayPal, and what is replayed?
3. Why is the buyer's real message on a sandbox dispute not read on that page?

## AG Studio dashboard (Nov 11)
1. `/dashboard` shows the site's real data in AG Studio, AG Grid's dashboard library: stored runs, the attack eval, and the live sandbox disputes.
2. The data is read on the server and handed to Studio as three tables. Studio does the charts, grids, totals and filters.
3. The verdict-stamp board is a custom widget: Studio sends it the rows for whatever fields are mapped, and it draws our ink stamps.
4. The attack table has one row per case, with separate columns for each agent. The first version mixed both agents into one 21% figure, which was wrong.
5. A Studio theme points every colour at the site's tokens. Chart colours avoid red and green, because those mean denied and allowed.

Recall questions:
1. Why did the first attack KPI ("21%") mislead, and how does one row per case fix it?
2. What does the custom widget get from Studio, and what does it draw?
3. Why must a chart on this site not paint "fight" in red?

## PayPal Server SDK via the APIMatic Context Plugin (Nov 11)
1. Orders, captures and refunds now go through PayPal's official TypeScript SDK (`OrdersController`, `PaymentsController`) instead of our own `fetch` calls. Disputes stay on our REST code because the SDK has no Disputes controller.
2. The APIMatic Context Plugin answered "what are the SDK's real method names, request fields and enums?" so the code was written from its answers, not from memory.
3. The idempotency key moved into the SDK's `paypalRequestId` parameter, so a retried refund still carries the same `PayPal-Request-Id`.
4. SDK errors (`ApiError`) are turned into our `PayPalError`, so the executor can still tell "PayPal said no" (4xx: stop) from "we don't know" (timeout: reconcile first).
5. SDK retries are off on purpose: only the executor decides when to retry, and only after reconciling.

Recall questions:
1. Why must the SDK not retry a refund by itself?
2. What would break in the executor if SDK errors were not mapped to `PayPalError`?
3. Which parts of the PayPal integration still use direct REST, and why?

## Three doors: the site gets a route (Nov 11)
1. The home page is now three doors in order: watch a dispute get decided (`/desk`), try to fool it (`/eval`), check the receipts (`/verify`). Mira's story comes first, so a judge knows whose money is at stake.
2. Every route page carries a numbered route bar at the top and ends with one "Next" button, so there is always exactly one obvious place to click. The header nav went from 6 items to 4; the rest moved to the footer.
3. The critique's honesty fixes: door 1 says Rebuttal "proposed" evidence (nothing was sent), the 0/24 vs 9/19 figures carry their date and model and explain why the naive agent is out of 19, and door 3 lists the checks instead of claiming they passed.
4. `--faint` text was darkened to pass WCAG AA contrast (4.5:1 for small text), and the replayed hero-3 run is wrapped in try/catch so a missing recording can't crash the home page during judging.
5. `/desk` now leads with one recommended case (the injection attempt) and lists the others below, instead of a table of equal choices.

Recall questions:
1. Why does door 1 say "proposed" and not "sent", and where would a judge check?
2. Why is the naive agent's score out of 19 rather than 24?
3. What happens to the home page if the hero-3 recording file goes missing, and why does that matter during Dec 1-15?

## Every page explains itself (Nov 11)
1. The run page now opens with "The outcome": what Rebuttal chose, what it proposed in a plain sentence, the firewall's stamp, and the naive agent beside it. Raw JSON and camelCase field names are gone.
2. `/eval` starts with "Your turn": a visitor clicks an action an attacker would want (refund $500, offer 90%, a bit.ly link) and the real firewall stamps it. It is a server action calling the same pure `gate()`; no model call, nothing sent.
3. `/verify` shows its result as a big stamp (VERIFIED or FAILED) with two numbered steps: pick a run, try to tamper with it.
4. Buttons that wait on the server say what they are doing ("Running the agent…") so nobody clicks twice, and the header marks the page you are on.
5. The 30-case table is folded away behind "Show every case"; the headline numbers and the per-attack marks come first.

Recall questions:
1. Why can the "Your turn" playground run without any LLM call, and which invariant blocks the $500 refund?
2. Why does the playground allow a full $10 refund, and whose job is it to decide that a refund is unwise?
3. What does `useFormStatus` give the pending button, and why does it matter on a slow server?
