// Ledger: deterministic chain, one changed byte breaks every later link, Ed25519 head signature round-trips.
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chain, GENESIS, nextLink, rootMessage, signRoot, verifyRoot, type Row } from "./ledger";

const rows: Row[] = [
  { id: 1, kind: "policy", disputeId: null, at: "2026-11-10T00:00:00.000Z", data: { maxOfferPct: 50 } },
  { id: 2, kind: "agent_trace", disputeId: "SYN-hero1", at: "2026-11-10T00:01:00.000Z", data: { rubric: { score: 85 }, packet: { sha256: "ab" } } },
  { id: 3, kind: "agent_trace", disputeId: "SYN-hero2", at: "2026-11-10T00:02:00.000Z", data: { rubric: { score: 10 } } },
];

describe("ledger", () => {
  it("is deterministic and key order does not matter", () => {
    const shuffled = rows.map((r) => (r.id === 2 ? { ...r, data: { packet: { sha256: "ab" }, rubric: { score: 85 } } } : r));
    expect(chain(shuffled)).toEqual(chain(rows));
    expect(chain(rows)[0]!.link).toBe(nextLink(GENESIS, chain(rows)[0]!.contentHash));
  });

  it("changing one value in row 2 changes row 2's hash and every later link, but not earlier ones", () => {
    const a = chain(rows);
    const b = chain(rows.map((r) => (r.id === 2 ? { ...r, data: { rubric: { score: 95 }, packet: { sha256: "ab" } } } : r)));
    expect(b[0]).toEqual(a[0]);
    expect(b[1]!.contentHash).not.toBe(a[1]!.contentHash);
    expect(b[2]!.link).not.toBe(a[2]!.link);
  });

  it("signs the head with Ed25519; a different head or message fails", () => {
    const { privateKey } = generateKeyPairSync("ed25519");
    const head = chain(rows).at(-1)!;
    const msg = rootMessage(head.id, head.link, "2026-11-10T01:00:00.000Z");
    const { signature, publicKeySpki } = signRoot(privateKey, msg);
    expect(verifyRoot(publicKeySpki, msg, signature)).toBe(true);
    expect(verifyRoot(publicKeySpki, rootMessage(head.id, "0".repeat(64), "2026-11-10T01:00:00.000Z"), signature)).toBe(false);
  });
});

describe("signing key config", () => {
  it("unset -> unsigned, no problem; garbage -> reported, never thrown; a real key -> used", async () => {
    const { signingKey } = await import("./ledger");
    expect(signingKey("")).toEqual({ key: null, problem: null });
    const bad = signingKey("node -e \"const {generateKeyPairSync}=require('crypto')\"");
    expect(bad.key).toBeNull();
    expect(bad.problem).toMatch(/not a valid key/);
    const good = generateKeyPairSync("ed25519").privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
    expect(signingKey(`  ${good}\n`).key?.asymmetricKeyType).toBe("ed25519");
  });
});
