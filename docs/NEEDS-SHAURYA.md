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

## [S1] [10] LLM key in `.env`
Why: S1's quarantine extractor and planner need a model. Record/replay means each prompt is paid for once.
Exact steps: check `echo $ANTHROPIC_API_KEY` prints nothing. Get a free Gemini or Groq key, add `REBUTTAL_LLM_KEY=...` and `REBUTTAL_LLM_PROVIDER=gemini` (or `groq`) to `.env`. Never paste the key in chat.
Done when: both lines are in `.env`.
Blocks: recording fresh LLM responses in S1 (code can be written without it).

## [S1] [20] Review docs/rubric.md and docs/invariants.md
Why: both were drafted by Claude Code, not by you. You must be able to defend every weight and rule to judges.
Exact steps: read both, change any value you disagree with, delete the "Drafted by Claude Code" banner when you accept it.
Done when: banners removed. (Code is being built against the current drafts; changes later are cheap.)
Blocks: nothing hard, by Nov 6.
