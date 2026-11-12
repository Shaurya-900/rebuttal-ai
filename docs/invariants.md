# Firewall invariants

> First drafted on 2026-11-03 with an AI assistant, at Shaurya's request. **Review before any test is written against it.** Values marked *(default)* are policy placeholders Shaurya should confirm.

The firewall (`src/lib/firewall/gate.ts`) takes one **proposed action** plus a **snapshot** of trusted state and returns exactly one decision:

- `ALLOW` — the executor may send it.
- `REQUIRE_APPROVAL(ruleId)` — park it until a human approves in `/desk`.
- `DENY(reasonCode)` — never sent; shown in the trace with the rule that fired.

## Ground rules

1. **Precedence:** every rule is evaluated. Any DENY → DENY (first DENY by rule order is the reported reason; all fired rules are logged). Else any REQUIRE_APPROVAL → REQUIRE_APPROVAL. Else ALLOW.
2. **Fail closed:** missing or unparseable snapshot fields → `DENY(SNAPSHOT_INCOMPLETE)`. The gate never fetches; the executor supplies a snapshot fetched immediately before the decision.
3. **Money is integer minor units** (cents) plus an ISO currency code. No floats anywhere in the gate.
4. **Time is UTC.** "Now" is passed in, never read from the clock inside the gate (makes tests deterministic).
5. **Approval is not a bypass.** An approved action is re-gated at send time against a fresh snapshot; only REQUIRE_APPROVAL rules are satisfied by the approval, DENY rules still apply.
6. **Pure function.** Same proposal + snapshot + policy + now → same decision. No I/O, no LLM.

## Snapshot (what the gate sees)

| Field | Source |
| --- | --- |
| `dispute.status`, `stage`, `links[].rel`, `seller_response_due_date`, `dispute_amount` | latest `GET /v1/customer/disputes/{id}` |
| `capture.amount`, `capture.currency` | Orders/Payments API, the capture this dispute is on |
| `refunded`, `pendingRefunds` | sum of completed / in-flight refunds on that capture (PayPal + our `action_intent` rows in SENDING) |
| `refundsToday`, `refundsToBuyer30d` | our `action_intent` table, CONFIRMED + SENDING |
| `buyerDisputes60d` | our `dispute` table, keyed by payer id |
| `executed` | set of `(dispute_id, action_type, params_hash)` already CONFIRMED or SENDING |
| `evidenceStore` | exhibit ids → `{ orderId, sha256 }` |

Note from the spike (`docs/paypal-notes.md`): link `rel` values are **underscored** (`provide_evidence`, `make_offer`, `accept_claim`). The gate compares against those.

## Policy *(defaults)*

| Key | Default |
| --- | --- |
| `maxOfferPct` | 50 % of disputed amount |
| `autoAcceptMaxCents` | 2 500 ($25) |
| `dailyRefundBudgetCents` | 20 000 ($200) |
| `perBuyerCap30dCents` | 10 000 ($100) |
| `repeatDisputerThreshold` | 3rd dispute in 60 days |
| `messageUrlAllowlist` | the store's own domain, `paypal.com` |

## Action → required link

| Proposed action | Required `rel` | Moves money? |
| --- | --- | --- |
| `SubmitEvidence` | `provide_evidence` | no |
| `MakeOffer` | `make_offer` | yes (offer amount) |
| `AcceptClaim` | `accept_claim` | yes (refund amount, full if unspecified) |
| `SendMessage` | `send_message` | no |
| `IssueRefund` | none (Payments API), but dispute must not be RESOLVED | yes |
| `AskSeller` | none — internal, always ALLOW unless I9 | no |

"Money amount" below means the offer/refund amount of the action; 0 for non-money actions.

## Invariants

### I1 — Never pay out more than is left on the capture
`amount ≤ capture.amount − refunded − pendingRefunds`
→ else `DENY(I1_EXCEEDS_REFUNDABLE)`.
**Oracle:** for every ALLOWed or REQUIRE_APPROVAL money action, `amount + refunded + pendingRefunds ≤ capture.amount`.

### I2 — PayPal must currently allow the action
All of: the required `rel` is in the snapshot's links; `status ≠ RESOLVED`; `now < seller_response_due_date`.
→ `DENY(I2_NO_LINK)` / `DENY(I2_CLOSED)` / `DENY(I2_PAST_DEADLINE)`.
**Oracle:** no ALLOW for an action whose rel is absent, on a resolved dispute, or at/after the deadline.

### I3 — Offers are capped by policy
`MakeOffer.amount ≤ floor(dispute_amount × maxOfferPct / 100)`
→ else `DENY(I3_OFFER_OVER_CAP)`. Applies after any precedent-based sizing; retrieval can never raise the cap.
**Oracle:** no ALLOWed offer above the cap, for any policy value 0–100.

### I4 — Budgets
`refundsToday + amount ≤ dailyRefundBudgetCents` and `refundsToBuyer30d + amount ≤ perBuyerCap30dCents`
→ else `DENY(I4_DAILY_BUDGET)` / `DENY(I4_BUYER_CAP)`.
**Oracle:** replaying any sequence of ALLOWed money actions never exceeds either budget.

### I5 — Currency matches the capture
`action.currency = capture.currency` (and = `dispute_amount.currency_code`)
→ else `DENY(I5_CURRENCY_MISMATCH)`. No conversion is ever attempted.
**Oracle:** no ALLOW with a mismatched currency.

### I6 — Outbound messages are templates only
`SendMessage` carries a `templateId` from the fixed template set and typed `slots`. Slot types: `orderId`, `trackingNumber`, `carrier` (enum), `date`, `moneyCents`, `url` (must be on `messageUrlAllowlist`). No free-text slot. No slot value may come from a buyer-derived field (quarantine output is tagged `untrusted`; the gate rejects untrusted slot values).
→ `DENY(I6_UNKNOWN_TEMPLATE)` / `DENY(I6_BAD_SLOT)` / `DENY(I6_URL_NOT_ALLOWED)` / `DENY(I6_UNTRUSTED_SLOT)`.
**Oracle:** every ALLOWed message renders to text whose only variable parts are typed slot values; no URL outside the allowlist appears.

### I7 — Large concessions need a human
`AcceptClaim` with refund amount `> autoAcceptMaxCents` → `REQUIRE_APPROVAL(I7)`.
**Oracle:** no ALLOW (without approval) for AcceptClaim above the threshold.

### I8 — Exhibits are real and belong to this order
Every exhibit id in `SubmitEvidence` exists in `evidenceStore`, its `orderId` equals the dispute's order, and its stored sha256 matches the bytes about to be uploaded.
→ `DENY(I8_UNKNOWN_EXHIBIT)` / `DENY(I8_WRONG_ORDER)` / `DENY(I8_HASH_MISMATCH)`.
**Oracle:** no ALLOWed submission references an exhibit outside the store, from another order, or with altered bytes.

### I9 — At most once
`params_hash = sha256(canonical JSON of action params)`. If `(dispute_id, action_type, params_hash) ∈ executed` → `DENY(I9_DUPLICATE)`. Backed by a unique DB constraint, so it holds across workers and restarts too.
**Oracle:** for any sequence (including replays and concurrent workers), each triple reaches CONFIRMED at most once.

### I10 — Repeat disputers need a human
`buyerDisputes60d ≥ repeatDisputerThreshold` (counting this one) → `REQUIRE_APPROVAL(I10)` on any money action.
**Oracle:** no un-approved ALLOW of a money action for a buyer at/over the threshold.

## Property-test plan (fast-check)

- **Generators:** random snapshot (amounts 0–100 000 cents, refunded ≤ capture, random link subsets, random status, deadline ±10 days from now, random currency from {USD, EUR, INR}), random policy within the ranges above, random action of each type with random params.
- **Main property:** for every generated triple, if the gate returns ALLOW then every oracle above holds; if any oracle would be violated the decision is DENY or REQUIRE_APPROVAL as specified.
- **Sequence property:** apply a random sequence of actions, feeding each ALLOWed money action back into the snapshot; assert I1, I4 and I9 hold at every step.
- **Determinism:** gate(x) called twice gives identical output.
- **Boundaries** (explicit unit tests, not just random): amount exactly equal to refundable (ALLOW), +1 cent (DENY); now = deadline − 1 ms (ALLOW), = deadline (DENY); offer exactly at cap (ALLOW).

Limitation for the README: these properties show the invariants hold over the tested inputs; they are not a proof. When the plan depends on untrusted data, schema-constrained enums reduce but do not remove risk.
