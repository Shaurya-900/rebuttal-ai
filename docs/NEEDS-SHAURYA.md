# Needs Shaurya

Things only you can do. Most urgent first. Claude Code keeps working on whatever is not blocked.
Last checked Nov 11 against the live site and Render. Done and removed: Render deploy, worker PayPal variables, ledger signing key (4 ticks on /verify), approver password, LLM key, PR #4.

## Before 23:59 IST tonight

### [Deploy] [5] Web: copy the PayPal id and secret from the worker
Why: `rebuttal-web` still gets `PayPal token failed: 401` (checked Nov 11), so `/desk/live` shows "PayPal did not answer" and `/store` checkout fails. The worker's copies work (it synced both sandbox disputes), so the web's copies have something extra in them: a space, a line break or a quote mark.
Exact steps: Render -> rebuttal-worker -> Environment -> reveal and copy `PAYPAL_CLIENT_ID` -> Render -> rebuttal-web -> Environment -> replace its `PAYPAL_CLIENT_ID` with exactly that -> same for `PAYPAL_CLIENT_SECRET` -> Save.
Done when: https://rebuttal-web.onrender.com/desk/live lists PP-R-HQO-10196189 and PP-R-FCU-10197630.

### [Deploy] [1] Merge PR #5
Why: trims stray spaces and line breaks from the PayPal keys, and turns a bad ledger key into a plain message on `/verify` instead of a crash.
Exact steps: https://github.com/Shaurya-900/rebuttal-ai/pull/5 -> Merge.
Done when: Render shows a new live deploy for both services.

### [Ship] [90] Record the video and upload it
Why: required for the submission (public YouTube, under 3 minutes, no copyrighted music).
Exact steps: read `docs/DEMO-CRIB.md` (10 min), edit `docs/VIDEO-SCRIPT.md` into your own words (check its "Do not say" list), record from the live site, upload as public.
Done when: you have a public YouTube link.

### [Ship] [30] Devpost text and submit
Exact steps: edit `docs/DEVPOST.md` into your own words, paste it into Devpost, add the YouTube link, the repo (github.com/Shaurya-900/rebuttal-ai) and the live URL. Fresh-browser test first: open the live URL in a private window and click Run demo, then `/eval` and `/verify`. Or run `BASE_URL=https://rebuttal-web.onrender.com npm run e2e`.
Done when: Devpost shows the project as submitted.

## Worth doing if there is time (each is optional; the README already states it as a limitation)

### [S5] [30] Review docs/attacks.md and own its seven decisions
Why: the eval already ran on Claude's draft rules (Nov 10: 0 of 24 attacks got through Rebuttal, 9 of 19 got through the naive agent). Judges may ask you to defend what counts as an attack "succeeding".
Exact steps: read the seven questions below and write your answer to each in `docs/attacks.md`. If you change a rule, run `npm run eval` (offline, seconds) and commit the new `eval/results/`. Then delete the "Drafted by Claude Code" banner.
1. **A8** was rewritten as poisoned listing text (the precedent corpus was dropped). OK?
2. **REQUIRE_APPROVAL** counts as blocked when the approval screen shows the rule. Keep, or call it a partial success?
3. **"Any run" rule:** an attack succeeds if it works in 1 of 3 runs. Keep, or use 2 of 3?
4. **Baseline effects:** the naive agent's proposal is treated as executed. OK?
5. **Size:** 24 attack cases and 6 honest ones were run (not 25 + 25), to fit Groq's free tier. OK?
6. **Temperature 0:** runs agreed on most cases. Keep, and say so?
7. **A4 and A6** are code-only, and the naive agent is "not measured" on them. OK?
Done when: the banner is gone and your seven answers are in the doc.

### [S1] [20] Review docs/rubric.md and docs/invariants.md
Why: both are still Claude's drafts (the banners are still there). You must be able to defend every weight and rule to judges.
Exact steps: read both, change any value you disagree with (then run `npm test`), and delete the "Drafted by Claude Code" banner.
Done when: banners removed.

### [S0] [5 each] Create 1-2 fresh, never-escalated disputes
Why: `make_offer` and `accept_claim` have never been run on the real sandbox. PP-R-FCU-10197630 lost its offer option when we sent a message. Also lets the evidence fix be re-run through the adapter itself.
Exact steps: sandbox personal account -> pay the business $10 (use `/store`, or `npm run sandbox:order`) -> Resolution Center -> Report a problem -> "I didn't receive it" -> do NOT escalate. Write the id and the creation time (IST) under "Fresh disputes" in `docs/paypal-notes.md`, and tell Claude Code the id.
Done when: an id and a creation time are in the notes.

### [S3] [10, after a captured payment] Check PayPal honours PayPal-Request-Id on refunds
Why: refund exactly-once rests on it (`docs/chaos/README.md`). Until then the README says the crash test used a simulated PayPal.
Exact steps: after `npm run sandbox:order` prints a capture id, tell Claude Code that id. It will run two 0.01 USD refunds with the same PayPal-Request-Id and check the second returns the first refund's id.
Done when: the result is in `docs/paypal-notes.md`.

### [Webhooks] [10] Register the sandbox webhook
Why: webhook delivery to the live URL is untested; the worker's 30 s poll already keeps disputes in sync, so this is optional.
Exact steps: developer.paypal.com -> your sandbox app -> Webhooks -> add `https://rebuttal-web.onrender.com/api/webhooks/paypal` with events `CUSTOMER.DISPUTE.CREATED`, `UPDATED`, `RESOLVED` -> copy the webhook id into `PAYPAL_WEBHOOK_ID` on both Render services (replacing `pending`).
Done when: Render's web logs show a webhook arriving after a dispute changes.
