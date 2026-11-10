# PROGRESS — milestones from docs/MASTER-PROMPT.md

Last updated: Tue 10 Nov 2026, about 04:15 IST. Deadline: Wed 11 Nov, 23:59 IST.
Branch: work on `phase-1`, merged to `main` by PR; Render deploys `main`.

| # | Milestone | State |
| --- | --- | --- |
| M0 | Audit, PROGRESS.md, docs | DONE (Nov 10). `invariants.md`, `rubric.md`, `attacks.md` exist but are still Claude's unreviewed drafts |
| M1 | PayPal spike resolved | **GO** (Nov 10): on PP-R-FCU-10197630 `send_message` 2xx and `provide_evidence` 200 (debug_id f589977c30084) with `PROOF_OF_FULFILLMENT` + tracking. `OTHER` gives 400 EVIDENCE_TYPE_IS_NOT_ALLOWED. Still untested: make_offer (removed by our message on this dispute; needs another fresh one), accept_claim, PayPal-Request-Id on disputes, maturation delay |
| M2 | Schema + seed | PARTIAL. Tables: dispute, action_intent, outbox, webhook_event, event_log, exhibit, usage_counter, approval. Synthetic records live in code (`src/lib/agent/scenarios.ts`), not in DB tables; no `npm run seed`. Not needed for the judge flow |
| M3 | Skeleton, health, render.yaml, first deploy | DONE. Web, worker and Postgres on paid plans (starter / basic_256mb, checked Nov 11). PR #4 live; 6/6 Playwright flows pass against the live URL. Worker crash-loops on missing PayPal env vars; web's PayPal keys return 401 (NEEDS-SHAURYA) |
| M4 | Agent pipeline offline | DONE. Cached answers are real model output (groq `openai/gpt-oss-120b`, recorded Nov 10) |
| M5 | PayPal adapter, webhook route, worker loops | PARTIAL. send_message verified through the adapter. Adapter now sends PROOF_OF_FULFILLMENT + tracking for INR evidence (the shape that got 200; adapter path itself not yet re-run on the sandbox, it needs a fresh dispute). Webhook delivery unverified |
| M6 | Executor, reconcile, faults, approvals | DONE in tests. A real PROPOSED→CONFIRMED sandbox action waits on M1 |
| M7 | /desk, Run demo, limits | DONE. Real pool disputes: read-only `/desk/live` (Nov 10; sending from the public desk deliberately left out). Nov 10: home page with the three promises; `/desk/policy` (edit with seller password, append-only history, used by runs and the worker). Per-IP limit behind Render's proxy unverified |
| M8 | /store checkout | DONE locally. Capture after a human approval is unverified (NEEDS-SHAURYA [S2]) |
| M9 | Eval | DONE (Nov 10) on the draft rules: 30 synthetic cases × 3 runs, report in `eval/results/`, shown on `/eval`. Rebuttal 0/24 attacks; naive baseline 9/19 measured. Shaurya still owns the 7 decisions in `docs/attacks.md`; changing a rule means `npm run eval` again (offline) |
| M10 | Chaos | PARTIAL. Fake-PayPal run done Nov 4: N=200+200, 0 duplicates, 0 missing. Real-sandbox run TODO: needs one captured payment (many 0.01 refunds on one capture) |
| M11 | Ledger + /verify | DONE (Nov 10): hash chain over event_log, Ed25519-signed head (`LEDGER_SIGNING_KEY`), browser re-check with two tamper demos. Checked locally in the browser. On Render it shows "unsigned" until the key is set (NEEDS-SHAURYA) |
| M12 | /dashboard (AG Studio) | DONE (Nov 11): AG Studio 3.0, three pages over real data (runs, eval, live disputes), custom verdict-stamp widget, theme on the site's tokens, edit mode. Unlicensed (watermark) unless AG_STUDIO_LICENSE_KEY is set |
| M13 | Render Workflows spike | NOT BUILT: needs Shaurya's Render workspace. Cut order item 2 |
| M14 | README, video script, Devpost text, Playwright, secret scan | PARTIAL. Done Nov 10: docs with real numbers; Playwright judge flows (`npm run e2e`, 5/5 pass locally); secret scan (no tracked secret files; none of the 4 `.env` secret values anywhere in git history). TODO: Shaurya's edit, video, e2e against the live URL after deploy |

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
