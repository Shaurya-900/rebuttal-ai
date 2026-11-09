# PROGRESS — milestones from docs/MASTER-PROMPT.md

Last updated: Tue 10 Nov 2026, about 04:15 IST. Deadline: Wed 11 Nov, 23:59 IST.
Branch: `phase-1` (all work so far; `main` still holds only the initial commit — merging is Shaurya's call).

| # | Milestone | State |
| --- | --- | --- |
| M0 | Audit, PROGRESS.md, docs | DONE (Nov 10). `invariants.md`, `rubric.md`, `attacks.md` exist but are still Claude's unreviewed drafts |
| M1 | PayPal spike resolved | BLOCKED: no fresh, never-escalated dispute id in `docs/paypal-notes.md` (NEEDS-SHAURYA [S0]) |
| M2 | Schema + seed | PARTIAL. Tables: dispute, action_intent, outbox, webhook_event, event_log, exhibit, usage_counter, approval. Synthetic records live in code (`src/lib/agent/scenarios.ts`), not in DB tables; no `npm run seed`. Not needed for the judge flow |
| M3 | Skeleton, health, render.yaml, first deploy | IN PROGRESS. `/api/health` and `render.yaml` written Nov 10 (unverified on Render). Deploy BLOCKED on Shaurya's Render account (NEEDS-SHAURYA [M3]) |
| M4 | Agent pipeline offline | DONE, with the caveat that all 10 cached LLM answers are hand-written stand-ins, not model output |
| M5 | PayPal adapter, webhook route, worker loops | PARTIAL. Built and unit-tested. No dispute action has succeeded against the sandbox (waits on M1). Webhook delivery unverified (waits on M3) |
| M6 | Executor, reconcile, faults, approvals | DONE in tests. A real PROPOSED→CONFIRMED sandbox action waits on M1 |
| M7 | /desk, Run demo, limits | PARTIAL. Done locally: `/desk`, `/desk/run/<id>`, approvals, per-IP limit, daily cap. Missing: `/desk/policy`, richer `/` page. Live URL waits on M3 |
| M8 | /store checkout | DONE locally. Capture after a human approval is unverified (NEEDS-SHAURYA [S2]) |
| M9 | Eval | BLOCKED: no LLM key (NEEDS-SHAURYA [S1]). `/eval` is a placeholder with no numbers |
| M10 | Chaos | PARTIAL. Fake-PayPal run done Nov 4: N=200+200, 0 duplicates, 0 missing. Real-sandbox run TODO: needs one captured payment (many 0.01 refunds on one capture) |
| M11 | Ledger + /verify | TODO |
| M12 | /dashboard (AG Studio) | TODO |
| M13 | Render Workflows spike | TODO |
| M14 | README, video script, Devpost text, Playwright, secret scan | TODO. README and docs can be written now |

## Verified facts (Nov 10 audit)
- `npm run typecheck` passes; `npm test`: 11 files, 68 tests pass.
- Typecheck first failed on iCloud duplicate files (`routes.d 2.ts`) inside `.next/`. Fixed by deleting `.next/` (a build cache). If it returns, delete `.next/` again.
- `.env` holds only the three PayPal variables. No LLM key, no `DATABASE_URL`, no approver token.

## Where the master prompt and CLAUDE.md disagree
- Master prompt: "nothing is cut". CLAUDE.md cut order: ledger, AG Studio, Workflows, Playwright go first. With under two days left, work order is: deploy (M3) → real PayPal results (M1) → eval (M9) → ship assets (M14) → then M11-M13.
- Master prompt: push to `origin main`. Pushing to `phase-1` until Shaurya says to merge.
- The `CLAUDE.md` in Downloads is older than the repo's (no S1-S4 status). The repo's copy was kept.

## Nov 10, 04:15 IST update
- Render: web is live at https://rebuttal-web.onrender.com (`/api/health` ok, reported by Shaurya). `rebuttal-worker` failed; log not seen yet. Env vars were only added to the web service, and the worker needs the PayPal ones too.
- Fresh dispute PP-R-FCU-10197630: INQUIRY, every action link present. Nothing sent yet; waiting on Shaurya's go-ahead because it is the only one.
- LLM: Groq key works with `openai/gpt-oss-120b`. `npm run hero` now loads `.env`.
- Real recordings committed (heroes 1 and 3 score 85, hero 2 OFFER $3, control ACCEPT). On hero 3 the naive baseline did not issue the $500 refund (SubmitEvidence, DENY by I8); tests and the run page now say so, by Shaurya's decision. M4's stand-in caveat is closed.

## Next action
Shaurya: the top three entries in `docs/NEEDS-SHAURYA.md` (Render, LLM key, fresh disputes).
Claude Code, unblocked: README + DEVPOST + VIDEO-SCRIPT drafts (M14), `/desk/policy` (M7), eval cases and runner against the stub cache so only the recording step remains (M9).
