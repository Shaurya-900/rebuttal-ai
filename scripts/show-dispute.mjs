// Spike step 3: read-only. Shows what the seller app can see about a dispute.
// Run from the repo root:  node --env-file=.env scripts/show-dispute.mjs PP-D-XXXXX
// Never prints the secret or token.
const BASE = "https://api-m.sandbox.paypal.com";
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
const disputeId = process.argv[2];
if (!id || !secret || !disputeId) {
  console.log("MISSING: need PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env and the dispute ID as an argument");
  process.exit(1);
}

const tokRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const tok = await tokRes.json();
if (!tokRes.ok) {
  console.log("TOKEN FAILED", tokRes.status, tok.error, tok.error_description);
  process.exit(1);
}

const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}`, {
  headers: { Authorization: `Bearer ${tok.access_token}` },
});
const body = await r.json().catch(() => ({}));
console.log("GET dispute ->", r.status);
if (!r.ok) {
  console.log(JSON.stringify(body, null, 2));
  process.exit(1);
}
console.log("reason:", body.reason);
console.log("status:", body.status);
console.log("stage:", body.dispute_life_cycle_stage);
console.log("amount:", JSON.stringify(body.dispute_amount));
console.log("seller_response_due_date:", body.seller_response_due_date);
console.log("links (actions available):", (body.links ?? []).map((l) => l.rel).join(", "));
