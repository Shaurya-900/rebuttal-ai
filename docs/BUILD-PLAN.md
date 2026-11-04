# BUILD-PLAN.md — how Claude Code builds Rebuttal with little supervision

Why this exists: Shaurya has little time (quiz Thu Nov 5, assignment submissions, Diwali week). Claude Code does the building in big steps, and Shaurya's time goes only to things nobody else can do. Read CLAUDE.md first; this file adds the protocol.

## Rules for unattended work
1. Before each step, read CLAUDE.md, docs/invariants.md, docs/rubric.md and docs/paypal-notes.md.
2. Work one step at a time (S0..S7 below). At the end of a step: run `npm run typecheck && npm test`, commit in small commits that explain why, update the Status section of CLAUDE.md, append a 5-line plain-English explanation and 3 recall questions to docs/learning-log.md, and update docs/DEMO-CRIB.md.
3. Never weaken, skip or delete a test to make it pass. Fix the code, or stop and write the question to docs/NEEDS-SHAURYA.md.
4. Never claim something works unless you ran it. Mark the rest "unverified". Never mock a PayPal success in anything a judge can click.
5. Never print or commit secrets. Do not commit `.env` or `consent.html`. Never set `ANTHROPIC_API_KEY`; the app's key is `REBUTTAL_LLM_KEY`.
6. Do not wait on Shaurya. If you need him, add an entry to docs/NEEDS-SHAURYA.md and keep working on whatever is not blocked.
7. If you hit a plan usage limit, stop at a clean commit and leave a one-line note at the top of docs/NEEDS-SHAURYA.md.
8. No parallel subagents. No large plugin bundles (for example ECC).
9. The cut order in CLAUDE.md applies. Ledger, AG Studio, Render Workflows and Playwright are OUT unless everything else is green.

## docs/NEEDS-SHAURYA.md format
```
## [Step] [minutes] Title
Why: ...
Exact steps: ...
Done when: ...
Blocks: <which step waits on this>
```

## docs/DEMO-CRIB.md
A running plain-English cheat sheet Shaurya can read in 10 minutes before recording: what each part does, one sentence per invariant, which numbers came from real runs (and which do not exist yet), and the three questions judges are most likely to ask with honest answers.

## Steps

**S0 - Resolve the spike (today, timebox about 90 minutes)**
- Use the fresh, never-escalated dispute (id in docs/paypal-notes.md). Poll with show-dispute and record the minutes since creation until the first action link appears (the maturation delay).
- `require-evidence`, then `provide-evidence`. If it returns 500, record the full body and `debug_id`, then try in order: (a) the evidence type the dispute lists under `evidences` with source REQUESTED_FROM_SELLER; (b) `PROOF_OF_FULFILLMENT` with carrier name and tracking number; (c) the same request as a plain curl; (d) `provide-supporting-info` if the stage is CHARGEBACK. Then `adjudicate`.
- Cheap extra test: does the Disputes API honor the `PayPal-Request-Id` header? Record the result.
- Exit: `provide-evidence` returns 200 (GO), or a written failure report with debug ids (see "If provide-evidence never works").

**S1 - PayPal-independent core (can start immediately, in parallel with S0)**
- `lib/llm.ts` (provider fallback + record/replay), quarantine extractor (no tools, Zod schema), rubric in code from docs/rubric.md, planner with read-only tools, evidence packet PDF with citations, synthetic seed fixtures for heroes 1-3, naive baseline agent skeleton.
- Exit: heroes 1 and 3 run end to end on fixtures, offline, from cached LLM responses. Hero 3 shows DENY with the reason.

**S2 - PayPal wiring**
- Hand-written `lib/paypal` adapter (about 10 fields, tolerant Zod). Actions: provide-evidence, make-offer, accept-claim, send-message. 30 s poller plus webhook route. A small script that verifies order create -> approve -> capture, then the `/store` checkout (approve-then-capture, no vaulting).
- Exit: `npm run test:sandbox` passes against the real sandbox for every verified action; unverified actions are listed.

**S3 - Crash safety**
- Executor with reconcile-before-retry, fault injection (`FAULT`), `npm run chaos`.
- Exit: a chaos run of at least 20 iterations shows exactly one effect on PayPal. Record N and the result honestly.

**S4 - UI**
- `/desk` (queue, trace, evidence packet, plain approve/deny buttons), the "Run demo" judge flow with cached results for seeded scenarios, per-IP limit and daily LLM cap, an `/eval` placeholder.

**S5 - Evaluation (needs docs/attacks.md written by Shaurya)**
- About 25 cases across the 8 attack classes, naive baseline vs Rebuttal, 3 runs each, fixed seeds, hidden ground truth. Report in the README and on `/eval`.
- If the free LLM tier cannot finish the runs, log the real throughput and add to NEEDS-SHAURYA (prepaid key, about Rs 450, auto-reload off).

**S6 - Deploy (needs Shaurya's Render account and card)**
- `render.yaml` (paid web + worker + Postgres), migrations, env vars, smoke test on the live URL, register the webhook and set `PAYPAL_WEBHOOK_ID`.
- Do an early skeleton deploy as soon as S2 has a route that returns 200 (target Fri Nov 6).

**S7 - Ship assets**
- README (what it is, real vs simulated, prior art, threat model, limitations, costs, how to run), LICENSE check, DEMO-CRIB.md, a 2:45 video script draft, a Devpost text draft.

## Target dates (IST)
S0 Wed Nov 4 night. S1 Nov 4-6. S2 Nov 6-7. S3 Nov 7-8. S4 Nov 8-9. S5 Nov 9-10. S6 skeleton Nov 6, final Nov 10. S7 Nov 10. Nov 11: fresh-browser judge test and submit by 23:59 IST. Diwali week is buffer: if Shaurya is away, S1 and S3 can still run without him.

## If provide-evidence never works
Do not pivot to another project; there is no time. Keep classification, rubric, evidence packet, firewall, offers, accept-claim, messages, crash safety and the eval. For FIGHT, submit by whichever call works; if none does, produce the packet and say plainly in the README and the video that the sandbox blocked the final submit, with the debug ids. Hero 1 then becomes "packet ready, submit blocked by a PayPal sandbox error". That is weaker, and we say so. We never fake a success.

## What only Shaurya can do (rough minutes)
| Task | Minutes | Needed by |
| --- | --- | --- |
| Create a fresh dispute (new $10 payment, Report a problem, do not escalate). Make 3 if possible | 5 each | Today |
| Check `ANTHROPIC_API_KEY` is empty; get a free Gemini or Groq key into `.env` | 10 | Today |
| Review docs/rubric.md and docs/invariants.md | 20 | Nov 6 |
| Write docs/attacks.md (one line per attack class: what the attacker does, what should happen) | 30 | Nov 8 |
| Render account, card, $50 credit claim, APIMatic form | 40 | Nov 6 |
| Register the sandbox webhook on the live URL | 10 | After deploy |
| Hand-create 5 more disputes for the demo pool | 25 | Nov 8 |
| Read the step summary and answer the 3 recall questions after each step | 20 each | Each step |
| Record the video, write the Devpost text, fresh-browser test, submit | about 3 hours | Nov 10-11 |
