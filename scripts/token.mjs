// Spike step 1: prove our sandbox credentials work. Never prints the token or secret.
// Run from the repo root:  node --env-file=.env scripts/token.mjs
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!id || !secret) {
  console.log("MISSING: PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET not found in .env");
  process.exit(1);
}

const res = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const data = await res.json();

if (!res.ok) {
  console.log("FAILED", res.status, data.error, data.error_description);
  process.exit(1);
}
console.log("OK: token received (not shown)");
console.log("expires_in:", data.expires_in);
console.log("scope:", data.scope);