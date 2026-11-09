// Spike step 2: create a test dispute as the buyer, then poll until PayPal opens up seller actions.
// Run from the repo root:
//   node --env-file=.env scripts/create-dispute.mjs <BUYER_TRANSACTION_ID>
// Needs in .env: PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BUYER_EMAIL (the sandbox PERSONAL account email)
// Never prints the secret or tokens.
const BASE = "https://api-m.sandbox.paypal.com";
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
const buyerEmail = process.env.PAYPAL_BUYER_EMAIL;
const txId = process.argv[2];

if (!id || !secret || !buyerEmail || !txId) {
  console.log("MISSING: need PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_BUYER_EMAIL in .env and the transaction ID as an argument");
  process.exit(1);
}

async function getToken() {
  const res = await fetch(`${BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) {
    console.log("TOKEN FAILED", res.status, data.error, data.error_description);
    process.exit(1);
  }
  return data.access_token;
}

// Unsigned JWT that tells PayPal "act as this buyer" (sandbox only).
function authAssertion() {
  const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64u({ alg: "none", typ: "JWT" })}.${b64u({ iss: id, email: buyerEmail })}.`;
}

const token = await getToken();
console.log("1) token OK");

// --- create the dispute as the buyer ---
const input = {
  disputed_transactions: [{ buyer_transaction_id: txId }],
  reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
  dispute_amount: { currency_code: "USD", value: "10" },
  extensions: {
    merchant_contacted: true,
    merchant_contacted_outcome: "NO_RESPONSE",
    merchandize_dispute_properties: { issue_type: "PRODUCT" },
  },
};
const form = new FormData();
form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));

const createRes = await fetch(`${BASE}/v1/customer/disputes`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "PayPal-Auth-Assertion": authAssertion() },
  body: form,
});
const createText = await createRes.text();
console.log("2) create dispute ->", createRes.status);
if (!createRes.ok) {
  console.log(createText);
  process.exit(1);
}
const created = JSON.parse(createText);
const selfLink = created.links?.find((l) => l.rel === "self")?.href ?? "";
const disputeId = selfLink.split("/").pop();
console.log("   dispute id:", disputeId);

// --- poll as the seller (the app) until actions open up ---
const t0 = Date.now();
const mmss = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
console.log("3) polling every 30s for up to 20 min (this measures the maturation delay)");
for (let i = 0; i < 40; i++) {
  const r = await fetch(`${BASE}/v1/customer/disputes/${disputeId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.log(`[${mmss()}] GET failed`, r.status, body.name, body.message);
  } else {
    const rels = (body.links ?? []).map((l) => l.rel);
    console.log(`[${mmss()}] status=${body.status} stage=${body.dispute_life_cycle_stage} links=${rels.join(",")}`);
    const ready = rels.some((x) => ["require_evidence", "provide_evidence", "adjudicate", "make_offer", "accept_claim"].includes(x)); // rels use underscores (observed)
    if (ready) {
      console.log(`READY after ${mmss()}. seller_response_due_date=${body.seller_response_due_date}`);
      process.exit(0);
    }
  }
  await new Promise((r) => setTimeout(r, 30000));
}
console.log("Not ready after 20 min. Paste the last few lines above.");
