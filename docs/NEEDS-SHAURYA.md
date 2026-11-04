# Needs Shaurya

Things only you can do. Newest blockers at the top. Claude Code keeps working on whatever is not blocked.

## [S0] [5 each] Create a fresh, never-escalated dispute (3 if you can)
Why: S0 needs a dispute that never went to the CHARGEBACK stage. The only one we have (PP-R-HQO-10196189) was escalated and `provide-evidence` returned 500 on it.
Exact steps:
1. Sandbox personal account -> pay the business account $10 (new payment each time; one dispute per transaction, ever).
2. Personal account -> Resolution Center -> Report a problem -> "I didn't receive it". **Do not escalate.**
3. Copy the dispute id (looks like `PP-R-XXX-NNNNNNNN`) and the time you created it (IST) into `docs/paypal-notes.md` under a new heading "Fresh disputes".
Done when: at least one new id + creation time is in `docs/paypal-notes.md`.
Blocks: S0 (go/no-go on provide-evidence). Keep one dispute un-touched for the offer demo (hero 2): offers only exist in INQUIRY.

## [S2] [10] Approve one sandbox payment (verifies capture + makes the next demo dispute)
Why: capture can only be verified after a human buyer approves; we never automate PayPal's login.
Exact steps: run `npm run sandbox:order`, open the printed link, log in as the sandbox BUYER, approve. The script captures and checks idempotency. Copy its last two lines into `docs/paypal-notes.md`. Then use that payment for a fresh dispute (entry above).
Done when: "captured: capture id …" and "SAME: idempotent" are in the notes.
Blocks: marking capture VERIFIED; it also gives you a payment for the S0 dispute.

## [S3] [10, after sandbox:order] Check that PayPal honours PayPal-Request-Id on refunds
Why: refund exactly-once rests on it (docs/chaos/README.md); without it the chaos control double-refunds 19/50.
Exact steps: after `npm run sandbox:order` prints a capture id, tell Claude Code that id. It will run two 0.01 USD refunds with the same PayPal-Request-Id and check that the second returns the first refund's id. (Two cents of sandbox money at most.)
Done when: the result is in `docs/paypal-notes.md`.
Blocks: saying "exactly-once refunds" without the word "simulated".

## [S2] [5 each, after S0] Run one dispute action per fresh INQUIRY dispute
Why: no offer/accept/message call has succeeded yet. Each one changes or closes the dispute, so use a dispute you don't need for the demo.
Exact steps: `SANDBOX_MUTATE_DISPUTE_ID=PP-R-... SANDBOX_MUTATE_ACTION=make_offer npm run test:sandbox` (then `send_message` on the same dispute; `accept_claim` last, since it closes it).
Done when: each action shows HTTP 2xx in the output; paste the line into `docs/paypal-notes.md`.
Blocks: hero 2 against the real sandbox.

## [S1] [10] LLM key in `.env`
Why: S1's quarantine extractor and planner need a model. Record/replay means each prompt is paid for once.
Exact steps: check `echo $ANTHROPIC_API_KEY` prints nothing. Get a free Gemini or Groq key, add `REBUTTAL_LLM_KEY=...` and `REBUTTAL_LLM_PROVIDER=gemini` (or `groq`) to `.env`. Never paste the key in chat.
Done when: both lines are in `.env`. Then run `REBUTTAL_LLM_MODE=record npm run hero -- all`, which replaces the hand-written stand-in answers in `fixtures/llm-cache/` with real ones, and `npm test`.
Blocks: any claim about how the model behaves (heroes currently run on stand-ins), and the S5 eval.

## [S1] [20] Review docs/rubric.md and docs/invariants.md
Why: both were drafted by Claude Code, not by you. You must be able to defend every weight and rule to judges.
Exact steps: read both, change any value you disagree with, delete the "Drafted by Claude Code" banner when you accept it.
Done when: banners removed. (Code is being built against the current drafts; changes later are cheap.)
Blocks: nothing hard, by Nov 6.

## [S4] [5] Pick a desk approver password
Why: Approve/Reject on `/desk` leads to real sandbox actions, so it needs a seller password. Without one, approvals are switched off on the hosted demo.
Exact steps: in `.env` (and later in Render's env vars) set `DESK_APPROVER_TOKEN=` to a random string of 12+ characters, e.g. the output of `openssl rand -hex 16`. Also set `RATE_LIMIT_SALT=` to another random string. Don't paste either into chat.
Done when: `/desk` shows the password box on a waiting action.
Blocks: the approval demo on the live URL.

## [S4] [2, look only] Try the desk locally
Why: so you can see the judge flow before S6 deploys it.
Exact steps: `npm run db:dev` in one terminal; in another, `DATABASE_URL=postgres://postgres:dev@127.0.0.1:54329/rebuttal npm run dev`; open http://localhost:3000/desk and click Run demo on Hero 3.
Done when: you've read one trace top to bottom and can explain each stage.
Blocks: nothing, but you'll be explaining this page in the video.
