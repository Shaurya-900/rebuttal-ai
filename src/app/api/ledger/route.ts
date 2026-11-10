// Ledger for /verify: every event_log row's content hash and chain link, the signed head, and (with ?run=<id>) that row's
// exact canonical content so the browser can hash it itself. The browser trusts none of the links: it recomputes them.
import { getDb } from "../../../lib/db/client";
import { canonicalRow, chain, readRows, rootMessage, signingKey, signRoot } from "../../../lib/ledger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const rows = await readRows(getDb());
  const entries = chain(rows);
  const head = entries.at(-1);
  const signedAt = new Date().toISOString();
  const message = head ? rootMessage(head.id, head.link, signedAt) : null;
  const { key, problem: keyProblem } = signingKey();
  const root = head && message
    ? { headId: head.id, head: head.link, signedAt, message, keyProblem, ...(key ? signRoot(key, message) : { signature: null, publicKeySpki: null }) }
    : null;

  const runId = Number(new URL(req.url).searchParams.get("run"));
  const row = Number.isInteger(runId) ? rows.find((r) => r.id === runId && r.kind === "agent_trace") : undefined;
  return Response.json({
    entries: entries.map(({ id, kind, at, contentHash }) => ({ id, kind, at, contentHash })), // links are recomputed in the browser
    root,
    run: row ? { id: row.id, canonical: canonicalRow(row) } : null,
  });
}
