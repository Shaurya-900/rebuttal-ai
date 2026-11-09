# PayPal sandbox notes (source of truth when docs and behaviour disagree)

## Timeline (IST = UTC+5:30; dispute PP-R-HQO-10196189)
- Dispute created by hand (buyer, Resolution Center): ~22:00 (seller_response_due_date 2026-11-23T16:30:35Z, i.e. 20 days after 22:00:35 IST)  — dispute id: PP-R-HQO-10196189 (format is PP-R-…, not PP-D-…)
- First show-dispute call: 22:15 — already WAITING_FOR_SELLER_RESPONSE / INQUIRY; links self, accept_claim, provide_evidence, send_message, escalate, make_offer
- Seller `escalate` (not in the original plan): 200 at 22:16
- After escalate: UNDER_REVIEW / INQUIRY 22:17–22:19 (links flicker between `self` and `self, provide_evidence`), then WAITING_FOR_SELLER_RESPONSE / CHARGEBACK from 22:19 (links self, accept_claim, provide_evidence)
- `require-evidence` link first appeared: **never** (polled 22:17–22:29, 24 polls)   → maturation delay = n/a
- require-evidence returned: not run (no link)
- provide-evidence returned: **500 INTERNAL_SERVER_ERROR / ERROR_PROCESSING_REQUEST** at 22:31 (debug_id f649595c408c8). Dispute unchanged afterwards (still WAITING_FOR_SELLER_RESPONSE, provide_evidence link still present). Note: seller_response_due_date moved from 2026-11-23 to 2026-11-14T04:59:59Z after escalate.
- adjudicate returned: ___ at __:__

## Verified
- Developer signup + sandbox work from India.
- Client-credentials token OK; scopes include disputes/create, read-buyer, read-seller, update-seller.
- Buyer consent via Log in with PayPal completes (redirect to example.com/callback?code=...).
- Seller app can GET a dispute created by hand.
- HATEOAS `rel` values use underscores (`provide_evidence`, `accept_claim`, `make_offer`, `send_message`), not the hyphenated path names.
- `escalate`: POST .../escalate body {"note":"..."} → 200, body is only a `detail` link. Moves INQUIRY → CHARGEBACK stage (PayPal calls the claim stage CHARGEBACK), passing through UNDER_REVIEW for ~3 min.
- Hand-created disputes open directly in WAITING_FOR_SELLER_RESPONSE, so `require-evidence` (needs UNDER_REVIEW) is not part of the normal path for them.
- (Nov 4, `npm run test:sandbox`) `GET /v1/customer/disputes?update_time_after=…&page_size=50` works; items carry `dispute_id`, `status`.
- (Nov 4) Orders v2 create with `payment_source.paypal.experience_context` returns status **PAYER_ACTION_REQUIRED** (not CREATED) and a `payer-action` link to `www.sandbox.paypal.com/checkoutnow?token=…`.
- (Nov 4) Orders v2 create honors **PayPal-Request-Id**: same id twice → same order id (order 442927852N123632B).
- (Nov 4) `/store` → PayPal sandbox login page with a fresh order token (checked in a browser, stopped at the login page).

## S2 adapter: what is verified against the sandbox and what is not (Nov 4)
| Call | Status |
| --- | --- |
| token, get dispute, list disputes | VERIFIED |
| create order, PayPal-Request-Id on create | VERIFIED |
| link-absent refusal (make_offer on the CHARGEBACK dispute) | VERIFIED (nothing sent) |
| buyer approve → capture, capture idempotency | UNVERIFIED: needs a human buyer login (`npm run sandbox:order`) |
| `/store/return` capture page | UNVERIFIED (same reason) |
| provide_evidence (multipart `input` + `evidence-file`) | 500 on the escalated dispute; S0 |
| make_offer `{note, offer_type, offer_amount}` | UNVERIFIED (shape matches schema.json `make_offer`) |
| accept_claim `{note, accept_claim_type:"REFUND"}` | UNVERIFIED (schema.json documents only the file part) |
| send_message `{message}` | UNVERIFIED (schema.json documents only the file part) |
| PayPal-Request-Id on Disputes | UNVERIFIED |
| verify-webhook-signature + real delivery | UNVERIFIED (needs a public URL) |
Run one dispute action with: `SANDBOX_MUTATE_DISPUTE_ID=PP-R-… SANDBOX_MUTATE_ACTION=make_offer npm run test:sandbox`.

## Blocked
- API create dispute as buyer: 400 invalid_request "No permissions to set target_client_id" (PayPal-Auth-Assertion rejected). Create disputes by hand instead.

## Request shapes (from docs + schema.json; mark VERIFIED once run)
- escalate: POST .../escalate body {"note":"..."}  [x] VERIFIED 200
- require-evidence: POST /v1/customer/disputes/{id}/require-evidence  body {"action":"SELLER_EVIDENCE"}  [ ] (link never offered)
- provide-evidence: POST .../provide-evidence multipart, part `input` (application/json) {"evidences":[{"evidence_type":"OTHER","notes":"..."}]}; schema.json only names an `evidence-file` part  [ ]
- adjudicate: POST .../adjudicate body {"adjudication_outcome":"SELLER_FAVOR"}  [ ]

## Open questions
- Does the Disputes API honor PayPal-Request-Id?
- Real webhook delivery to a public URL?
- Why is the buyer assertion rejected? (does the app need a scope PayPal must enable?)
- Does `require_evidence` ever appear for a hand-created dispute, e.g. after provide-evidence puts it back in UNDER_REVIEW?

---

# Raw request/response log

## 2026-11-03T16:45:18Z — show-dispute on PP-R-HQO-10196189

Request: `GET /v1/customer/disputes/PP-R-HQO-10196189`
Response: 200
- reason: MERCHANDISE_OR_SERVICE_NOT_RECEIVED
- status: WAITING_FOR_SELLER_RESPONSE
- dispute_life_cycle_stage: INQUIRY
- dispute_amount: USD 10.00
- seller_response_due_date: 2026-11-23T16:30:35.522Z
- links: self, accept_claim, provide_evidence, send_message, escalate, make_offer

**Observed, differs from our assumptions:**
1. Dispute IDs can look like `PP-R-XXX-NNNNNNNN`, not only `PP-D-…`.
2. HATEOAS `rel` values use **underscores** (`provide_evidence`, `accept_claim`, `make_offer`), not the hyphenated URL path names. Code that matches `rel === "provide-evidence"` never fires; `create-dispute.mjs`'s readiness check has this bug.
3. The dispute opens already in WAITING_FOR_SELLER_RESPONSE (INQUIRY stage) with no `require_evidence` link. The docs say require-evidence needs UNDER_REVIEW, so it can't appear in this state without something else (maybe `escalate`) moving it to the CHARGEBACK/claim stage first.

## 2026-11-03T16:46:44.492Z — escalate on PP-R-HQO-10196189

Pre-check GET /v1/customer/disputes/PP-R-HQO-10196189 -> 200 (paypal-debug-id ca54cdb596bde)
status=WAITING_FOR_SELLER_RESPONSE stage=INQUIRY due=2026-11-23T16:30:35.522Z links=self,send_message,make_offer,provide_evidence,escalate,accept_claim

Request: POST https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-HQO-10196189/escalate
```json
{
  "note": "SYNTHETIC spike: escalating inquiry to claim to test require-evidence."
}
```

Response: 200 in 2055 ms (paypal-debug-id ca54cdb64dbb2)
```json
{
  "links": [
    {
      "href": "https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-HQO-10196189",
      "rel": "detail",
      "method": "GET",
      "encType": "application/json"
    }
  ]
}
```

## 2026-11-03T16:46:57Z — polling show-dispute after escalate (every 30 s, max 20 min)

- 16:47:01Z GET dispute -> 200 status: UNDER_REVIEW stage: INQUIRY links (actions available): self 
- 16:47:35Z GET dispute -> 200 status: UNDER_REVIEW stage: INQUIRY links (actions available): self, provide_evidence 
- 16:48:06Z GET dispute -> 200 status: UNDER_REVIEW stage: INQUIRY links (actions available): self, provide_evidence 
- 16:48:39Z GET dispute -> 200 status: UNDER_REVIEW stage: INQUIRY links (actions available): self, provide_evidence 
- 16:49:13Z GET dispute -> 200 status: UNDER_REVIEW stage: INQUIRY links (actions available): self 
- 16:49:46Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:50:18Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:50:51Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:51:24Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:51:57Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, provide_evidence, accept_claim 
- 16:52:30Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:53:02Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:53:37Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:54:10Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:54:42Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:55:15Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:55:48Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:56:20Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:56:52Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:57:25Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:57:58Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:58:31Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:59:04Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 
- 16:59:37Z GET dispute -> 200 status: WAITING_FOR_SELLER_RESPONSE stage: CHARGEBACK links (actions available): self, accept_claim, provide_evidence 

## 2026-11-03T17:01:16.028Z — provide-evidence on PP-R-HQO-10196189

Pre-check GET /v1/customer/disputes/PP-R-HQO-10196189 -> 200 (paypal-debug-id f42727313ab2f)
status=WAITING_FOR_SELLER_RESPONSE stage=CHARGEBACK due=2026-11-14T04:59:59.000Z links=self,accept_claim,provide_evidence

Request: POST https://api-m.sandbox.paypal.com/v1/customer/disputes/PP-R-HQO-10196189/provide-evidence
```json
{
  "input (application/json part)": {
    "evidences": [
      {
        "evidence_type": "OTHER",
        "notes": "SYNTHETIC spike evidence: item shipped, tracking shows delivered.",
        "documents": [
          {
            "name": "spike-evidence.pdf"
          }
        ]
      }
    ]
  },
  "evidence-file": "spike-evidence.pdf (application/pdf, synthetic)"
}
```

Response: 500 in 1737 ms (paypal-debug-id f649595c408c8)
```json
{
  "name": "INTERNAL_SERVER_ERROR",
  "message": "An internal server error has occurred.",
  "debug_id": "f649595c408c8",
  "information_link": "https://developer.paypal.com/docs/api/customer-disputes/v1/#errors",
  "details": [
    {
      "issue": "ERROR_PROCESSING_REQUEST"
    }
  ],
  "links": []
}
```

## 2026-11-03T17:01:27Z — show-dispute after provide-evidence 500

```
GET dispute -> 200
reason: MERCHANDISE_OR_SERVICE_NOT_RECEIVED
status: WAITING_FOR_SELLER_RESPONSE
stage: CHARGEBACK
amount: {"currency_code":"USD","value":"10.00"}
seller_response_due_date: 2026-11-14T04:59:59.000Z
links (actions available): self, accept_claim, provide_evidence
```
## Fresh disputes
PP-R-FCU-10197630 (created by hand by Shaurya, Nov 9-10; creation time not recorded, so no maturation-delay measurement from this one)

Read-only check, Nov 10 about 04:00 IST (`show-dispute.mjs`), nothing sent:
```
reason: MERCHANDISE_OR_SERVICE_NOT_RECEIVED
status: WAITING_FOR_SELLER_RESPONSE
stage: INQUIRY
amount: 10.00 USD
seller_response_due_date: 2026-11-29T22:12:33.247Z
links: self, send_message, escalate, provide_evidence, accept_claim, make_offer
```
First time `make_offer` and `send_message` links have been observed. No action has been run on it yet.

## Groq, Nov 10
- `llama-3.3-70b-versatile` returns HTTP 404 for this key; it is not in the account's model list. Default Groq model is now `openai/gpt-oss-120b`.
- The free tier returned HTTP 429 after about 9 calls in one run; a second run a minute later went through.
