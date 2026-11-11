# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: PayPal AI Hackathon 2026 judges** (judging runs 1–15 December 2026). They open the hosted site cold, with no setup and limited time, and score it on technological implementation, design, potential impact, innovation and presentation. Their job is to understand what Rebuttal does, see it work, and decide whether its claims hold up.

**The story they are told: Mira**, a synthetic solo seller of refurbished film cameras (about $150 an order) with PayPal checkout. She handles every dispute herself, has no time, and wants clear cases fought, honest condition complaints settled at up to 30%, and big claims never auto-accepted. The product is designed around her job; the site is evaluated by judges.

## Product Purpose

When a buyer opens a PayPal dispute ("I never got it", "not as described"), a small seller has days to answer with evidence, an offer or a refund, and often misses the deadline or loses a winnable case. Rebuttal reads the dispute, gathers the seller's own records, scores the case with a fixed rubric in code, decides to fight, offer or accept, and acts in PayPal only through a deterministic firewall, showing every step as a trace with sources.

Success, for this site: a judge leaves believing the safety claims because they checked them, not because they were told.

## Positioning

**Measured, not claimed.** Open source; every money-moving action passes a firewall written in plain code; and each safety promise comes with evidence anyone can re-run or re-check:
- a published adversarial evaluation against a naive agent on the same model (Nov 10: 0 of 24 synthetic attacks got through Rebuttal, 9 of 19 got through the naive agent);
- a `kill -9` crash test with a negative control;
- a hash-chained, signed ledger the visitor's own browser verifies.

Commercial tools (Chargeflow, ChargePay, Justt, Chargebacks911; Stripe's and Shopify's evidence builders) already automate disputes, and the safety patterns (Dual-LLM, CaMeL) are published. Rebuttal's difference is publishing its measurements, not inventing a technique.

## Operating Context

- Judges use the hosted demo at https://rebuttal-web.onrender.com and the public repo github.com/Shaurya-900/rebuttal-ai. They also watch a demo video under 3 minutes and read a Devpost write-up.
- Judge flows:
  - `/desk`: run a seeded demo dispute and read the stage-by-stage trace.
  - `/eval`: the attack results.
  - `/verify`: re-check the ledger and a run's evidence PDF in the browser, including tamper demos.
  - `/dashboard`: an AG Studio dashboard over runs, the eval and live disputes.
  - `/desk/live`: real PayPal sandbox disputes, read-only.
  - `/desk/policy`: the seller's limits.
  - `/store`: a sandbox checkout.
- Everything runs against the PayPal **sandbox**; demo disputes are hand-made in the sandbox Resolution Center; seeded demo runs replay recorded model answers and send nothing to PayPal.

## Capabilities and Constraints

- Web: Next.js App Router, TypeScript, Tailwind, Postgres; hosted on Render (paid plans: web, worker, Postgres).
- PayPal: Disputes via REST (evidence accepted on a real sandbox dispute), Orders/captures/refunds via PayPal's Server SDK. Sponsor tools in use: AG Studio (dashboard), APIMatic Context Plugin (SDK integration), Render (hosting).
- Terminology used on the site: dispute, inquiry/claim stage, evidence packet, rubric, firewall verdict (allowed / denied / held for seller), quarantine, naive agent, ledger.
- Project rules from the brief (principles 7–8 and the status notes), binding on any page:
  - all synthetic data is labelled synthetic;
  - every number shown comes from a dated, committed run;
  - untested things are labelled unverified;
  - simulator-only PayPal endpoints are labelled "PayPal simulator".
- Deliberately not built: sending real actions on real disputes from the public desk (a public button could use up the hand-made disputes during judging).

## Brand Commitments

- Name: **Rebuttal**. Tagline in use: "A PayPal dispute agent that cannot be talked out of the rules."
- Never claim to be first or only; credit prior art by name.
- No PayPal look-alike: no PayPal logos, brand colours or imitation of PayPal's branded checkout button (hackathon trademark rule). "PayPal" appears only as plain text naming the platform.

## Evidence on Hand

- Attack evaluation report: `eval/results/report.json` / `report.md` (30 synthetic cases, 3 runs, groq `openai/gpt-oss-120b`, temperature 0, Nov 10).
- Crash test: `docs/chaos/README.md` (Nov 4; simulated PayPal; 0 duplicates in about 400 kills; negative control 19 double refunds in 50).
- PayPal sandbox observations with debug ids: `docs/paypal-notes.md`.
- Recorded model answers: `fixtures/llm-cache/`, `eval/llm-cache/`.
- **Absent, never to be fabricated:** real sellers, customers, testimonials, real-world win rates, revenue or adoption figures, press.

## Product Principles

1. **The model proposes; code disposes.** Interfaces show the deterministic decision (rubric, firewall rule) as the authority, never the model's opinion.
2. **Show the receipt.** Every claim on screen links to the run, record or file that proves it.
3. **Honest labels beat impressive numbers.** Synthetic, simulated and unverified are stated plainly where they apply.
4. **Zero setup for the evaluator.** A judge can reach every proof from the hosted URL in a click or two.
5. **Credit what came before.** Position against prior art openly; never imply invention.
