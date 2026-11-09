// Spike step 4: run ONE seller-side sandbox step on a dispute and log it to docs/paypal-notes.md.
// Run from the repo root:
//   node --env-file=.env scripts/seller-step.mjs PP-D-XXXXX escalate
//   node --env-file=.env scripts/seller-step.mjs PP-D-XXXXX require-evidence
//   node --env-file=.env scripts/seller-step.mjs PP-D-XXXXX provide-evidence
//   node --env-file=.env scripts/seller-step.mjs PP-D-XXXXX adjudicate [SELLER_FAVOR|BUYER_FAVOR]
// Re-fetches the dispute first and refuses if the step's HATEOAS link is absent.
// Body shapes from developer.paypal.com/api/customer-disputes/v1/schema.json (require_evidence, adjudicate, evidence).
// Never prints or logs the secret or token.
import { appendFileSync, mkdirSync } from "node:fs";

const BASE = "https://api-m.sandbox.paypal.com";
const NOTES = "docs/paypal-notes.md";
const id = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
const [disputeId, step, outcome = "SELLER_FAVOR"] = process.argv.slice(2);
const STEPS = ["escalate", "require-evidence", "provide-evidence", "adjudicate"];

if (!id || !secret || !disputeId || !STEPS.includes(step)) {
  console.log(`MISSING: need PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET in .env, a dispute ID, and a step (${STEPS.join(" | ")})`);
  process.exit(1);
}
if (step === "adjudicate" && !["SELLER_FAVOR", "BUYER_FAVOR"].includes(outcome)) {
  console.log("adjudicate outcome must be SELLER_FAVOR or BUYER_FAVOR");
  process.exit(1);
}

mkdirSync("docs", { recursive: true });
const log = (s) => {
  console.log(s);
  appendFileSync(NOTES, s + "\n");
};
const fence = (x) => "```json\n" + (typeof x === "string" ? x : JSON.stringify(x, null, 2)) + "\n```";

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
const auth = { Authorization: `Bearer ${tok.access_token}` };

log(`\n## ${new Date().toISOString()} — ${step} on ${disputeId}\n`);

// Pre-check: latest dispute state decides legality (CLAUDE.md principle 4).
const g = await fetch(`${BASE}/v1/customer/disputes/${disputeId}`, { headers: auth });
const d = await g.json().catch(() => ({}));
const rels = (d.links ?? []).map((l) => l.rel);
log(`Pre-check GET /v1/customer/disputes/${disputeId} -> ${g.status} (paypal-debug-id ${g.headers.get("paypal-debug-id")})`);
log(`status=${d.status} stage=${d.dispute_life_cycle_stage} due=${d.seller_response_due_date} links=${rels.join(",")}\n`);
if (!g.ok) {
  log(fence(d));
  process.exit(1);
}
const link = d.links.find((l) => l.rel === step.replace("-", "_")); // rels use underscores (observed)
if (!link) {
  log(`STOP: no \`${step}\` link on the dispute; not calling it.`);
  process.exit(1);
}

let body, headers, shown;
if (step === "escalate") {
  shown = { note: "SYNTHETIC spike: escalating inquiry to claim to test require-evidence." };
  body = JSON.stringify(shown);
  headers = { ...auth, "Content-Type": "application/json" };
} else if (step === "require-evidence") {
  shown = { action: "SELLER_EVIDENCE" };
  body = JSON.stringify(shown);
  headers = { ...auth, "Content-Type": "application/json" };
} else if (step === "adjudicate") {
  shown = { adjudication_outcome: outcome };
  body = JSON.stringify(shown);
  headers = { ...auth, "Content-Type": "application/json" };
} else {
  // Multipart: JSON "input" part + one PDF "evidence-file" part. Type OTHER per the docs' internal-testing advice.
  const fileName = "spike-evidence.pdf";
  const input = {
    evidences: [
      {
        evidence_type: "OTHER",
        notes: "SYNTHETIC spike evidence: item shipped, tracking shows delivered.",
        documents: [{ name: fileName }],
      },
    ],
  };
  body = new FormData();
  body.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
  body.append("evidence-file", new Blob([tinyPdf()], { type: "application/pdf" }), fileName);
  headers = auth; // fetch sets the multipart boundary
  shown = { "input (application/json part)": input, "evidence-file": `${fileName} (application/pdf, synthetic)` };
}

log(`Request: ${link.method ?? "POST"} ${link.href}`);
log(fence(shown) + "\n");
const t0 = Date.now();
const r = await fetch(link.href, { method: link.method ?? "POST", headers, body });
const text = await r.text();
let parsed;
try {
  parsed = JSON.parse(text);
} catch {
  parsed = text || "(empty body)";
}
log(`Response: ${r.status} in ${Date.now() - t0} ms (paypal-debug-id ${r.headers.get("paypal-debug-id")})`);
log(fence(parsed));
process.exit(r.ok ? 0 : 1);

// Smallest valid one-page PDF with a single line of text.
function tinyPdf() {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const stream = "BT /F1 12 Tf 20 50 Td (SYNTHETIC spike evidence) Tj ET";
  objs[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  let out = "%PDF-1.4\n";
  const offsets = objs.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return out;
}
