// Evidence ledger: a hash chain over the append-only event_log, with an Ed25519-signed head.
//   contentHash(row) = sha256(canonical JSON of {id, kind, disputeId, at, data})
//   link(row)        = sha256(previous link + "|" + contentHash)        (genesis previous link = 64 zeros)
// Changing one byte of any stored row changes its content hash and every link after it, so the signed head no longer matches.
// The browser re-checks all of this on /verify. Timestamps are the server's own (self-asserted), and the head is signed when
// /verify asks for it: this proves what the server holds now has not been rewritten since, not when each row was written.
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Db } from "./exec/intents";
import { canonicalJson } from "./firewall/gate";

export const GENESIS = "0".repeat(64);
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export type Row = { id: number; kind: string; disputeId: string | null; at: string; data: unknown };
export type Entry = { id: number; kind: string; at: string; contentHash: string; link: string };

export const canonicalRow = (r: Row) => canonicalJson({ id: r.id, kind: r.kind, disputeId: r.disputeId, at: r.at, data: r.data });
export const nextLink = (prev: string, contentHash: string) => sha256(`${prev}|${contentHash}`);

export function chain(rows: Row[]): Entry[] {
  let prev = GENESIS;
  return rows.map((r) => {
    const contentHash = sha256(canonicalRow(r));
    prev = nextLink(prev, contentHash);
    return { id: r.id, kind: r.kind, at: r.at, contentHash, link: prev };
  });
}

// ponytail: reads the whole log on each request; fine for a demo's few thousand rows. Store links in a column when it grows.
export async function readRows(db: Db): Promise<Row[]> {
  const r = await db.execute(sql`select id, kind, dispute_id, at, data from event_log order by id`);
  return (r as unknown as { rows: { id: number; kind: string; dispute_id: string | null; at: Date | string; data: unknown }[] }).rows.map((x) => ({
    id: Number(x.id), kind: x.kind, disputeId: x.dispute_id, at: new Date(x.at).toISOString(), data: x.data,
  }));
}

export const rootMessage = (headId: number, head: string, signedAt: string) => `rebuttal-ledger-v1|${headId}|${head}|${signedAt}`;

/** LEDGER_SIGNING_KEY: base64 PKCS#8 DER of an Ed25519 private key. Unset -> the head is shown unsigned. */
export function signingKey(): KeyObject | null {
  const b64 = process.env.LEDGER_SIGNING_KEY;
  if (!b64) return null;
  return createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
}

export function signRoot(key: KeyObject, message: string) {
  return {
    signature: sign(null, Buffer.from(message, "utf8"), key).toString("base64"),
    publicKeySpki: createPublicKey(key).export({ format: "der", type: "spki" }).toString("base64"),
  };
}

export function verifyRoot(publicKeySpki: string, message: string, signature: string): boolean {
  const pub = createPublicKey({ key: Buffer.from(publicKeySpki, "base64"), format: "der", type: "spki" });
  return verify(null, Buffer.from(message, "utf8"), pub, Buffer.from(signature, "base64"));
}
