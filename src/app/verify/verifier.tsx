"use client";
// Runs entirely in the browser: SHA-256 and Ed25519 come from WebCrypto, not from the server.
import { useCallback, useEffect, useState } from "react";
import { caseName } from "../desk/ui";

type Ledger = {
  entries: { id: number; kind: string; at: string; contentHash: string }[];
  root: { headId: number; head: string; signedAt: string; message: string; signature: string | null; publicKeySpki: string | null; keyProblem?: string | null } | null;
  run: { id: number; canonical: string } | null;
};
type Check = { ok: boolean | null; label: string; detail?: string };
type Tamper = "none" | "pdf" | "record";

const GENESIS = "0".repeat(64);
const enc = new TextEncoder();
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  const d = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const short = (h: string) => `${h.slice(0, 12)}…`;

async function verifySig(spki: string, message: string, sig: string): Promise<boolean | null> {
  try {
    const key = await crypto.subtle.importKey("spki", b64(spki), { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, b64(sig), enc.encode(message));
  } catch {
    return null; // this browser's WebCrypto has no Ed25519
  }
}

export default function Verifier({ runs, initialRun }: { runs: { id: number; scenario: string; choice: string }[]; initialRun: number | null }) {
  const [runId, setRunId] = useState<number | null>(initialRun);
  const [tamper, setTamper] = useState<Tamper>("none");
  const [checks, setChecks] = useState<Check[]>([]);
  const [busy, setBusy] = useState(true);

  const verify = useCallback(async () => {
    setBusy(true);
    const out: Check[] = [];
    try {
      const L = (await (await fetch(`/api/ledger${runId ? `?run=${runId}` : ""}`, { cache: "no-store" })).json()) as Ledger;
      if (!L.root) {
        setChecks([{ ok: null, label: "The log is empty. Run a demo on the desk first." }]);
        return;
      }

      // 1. The chosen run's record: hash it here and compare with the hash the chain was built from.
      const hashes = new Map(L.entries.map((e) => [e.id, e.contentHash]));
      let recordHash: string | null = null;
      if (L.run) {
        let canonical = L.run.canonical;
        if (tamper === "record") {
          // Change one byte: the rubric score's first digit (85 -> 95), as if someone edited the stored record.
          const i = canonical.indexOf('"score":');
          const j = i >= 0 ? i + 8 : 10;
          canonical = canonical.slice(0, j) + (canonical[j] === "9" ? "8" : "9") + canonical.slice(j + 1);
        }
        recordHash = await sha256Hex(canonical);
        const want = hashes.get(L.run.id)!;
        out.push({ ok: recordHash === want, label: `Run #${L.run.id}'s stored record hashes to the value in the chain`, detail: `${short(recordHash)} vs ${short(want)}` });

        // 2. Its evidence PDF: hash the bytes and compare with the hash written inside the record.
        const rec = JSON.parse(L.run.canonical) as { data: { packet?: { sha256: string } } };
        if (rec.data.packet) {
          const pdf = new Uint8Array(await (await fetch(`/desk/run/${L.run.id}/packet`, { cache: "no-store" })).arrayBuffer());
          if (tamper === "pdf") { const i = Math.floor(pdf.length / 2); pdf[i] = pdf[i]! ^ 0x01; } // flip one bit of one byte
          const got = await sha256Hex(pdf);
          out.push({ ok: got === rec.data.packet.sha256, label: `Its evidence PDF (${pdf.length} bytes) matches the hash in the record`, detail: `${short(got)} vs ${short(rec.data.packet.sha256)}` });
        } else {
          out.push({ ok: null, label: "This run has no evidence PDF (only FIGHT decisions produce one)." });
        }
      }

      // 3. Recompute every link from the start, using our own hash for the chosen run.
      let prev = GENESIS;
      for (const e of L.entries) prev = await sha256Hex(`${prev}|${e.id === L.run?.id && recordHash ? recordHash : e.contentHash}`);
      out.push({ ok: prev === L.root.head, label: `Recomputed chain over ${L.entries.length} rows reaches the head the server signed`, detail: `${short(prev)} vs ${short(L.root.head)}` });

      // 4. The signature on the head.
      const msgOk = L.root.message === `rebuttal-ledger-v1|${L.root.headId}|${L.root.head}|${L.root.signedAt}`;
      if (!L.root.signature || !L.root.publicKeySpki) {
        out.push({ ok: null, label: L.root.keyProblem ? `The head is not signed: ${L.root.keyProblem}.` : "The head is not signed on this deploy (no signing key set)." });
      } else {
        const sig = await verifySig(L.root.publicKeySpki, L.root.message, L.root.signature);
        out.push(sig === null
          ? { ok: null, label: "This browser cannot check Ed25519 signatures. Try a current Chrome, Firefox or Safari." }
          : { ok: sig && msgOk, label: "Ed25519 signature on the head is valid for the server's public key", detail: `key ${short(await sha256Hex(b64(L.root.publicKeySpki)))} (fingerprint)` });
      }
    } catch (e) {
      out.push({ ok: false, label: "Could not load the ledger", detail: e instanceof Error ? e.message : String(e) });
    } finally {
      setChecks(out);
      setBusy(false);
    }
  }, [runId, tamper]);

  useEffect(() => { void verify(); }, [verify]);

  const failed = checks.some((c) => c.ok === false);
  return (
    <section className="mt-8 rounded-xl border border-rule bg-white p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3" aria-live="polite">
        <span className={`stamp ${busy ? "text-faint" : failed ? "text-deny" : "text-allow"}`}>
          <span className="text-lg">{busy ? "CHECKING" : failed ? "FAILED" : "VERIFIED"}</span>
          <small>{busy ? "in your browser" : failed ? "not what was signed" : "by your browser"}</small>
        </span>
        <p className="min-w-0 flex-1 basis-60 text-base font-semibold">
          {busy ? "Checking…" : failed ? "What you have is not what was signed. One changed byte is enough." : "The record, its evidence and the chain match the signed head."}
        </p>
      </div>

      <div className="mt-6 grid gap-5 border-t border-rule pt-5">
        <label className="text-sm">
          <span className="block font-semibold">Which run</span>
          <select className="field block w-auto max-w-full" value={runId ?? ""} onChange={(e) => setRunId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Chain only</option>
            {runs.map((r) => <option key={r.id} value={r.id}>Run {r.id}: {caseName(r.scenario)} ({r.choice?.toLowerCase()})</option>)}
          </select>
        </label>
        <div className="text-sm">
          <span className="block font-semibold">Now tamper with it</span>
          <div className="mt-1 flex flex-wrap gap-2" role="group" aria-label="Tamper demo">
          {([["none", "Leave it untouched"], ["pdf", "Change one byte of the PDF"], ["record", "Edit the stored score"]] as const).map(([t, label]) => (
            <button key={t} type="button" onClick={() => setTamper(t)} aria-pressed={tamper === t}
              className={`rounded-md border px-3 py-1.5 ${tamper === t ? "border-act bg-act text-act-ink" : "border-rule bg-white hover:bg-sunk"}`}>
              {label}
            </button>
          ))}
          </div>
        </div>
      </div>
      {tamper !== "none" && <p className="mt-3 text-xs text-hold">Tamper demo: the change is made to your browser&apos;s copy only, before hashing. Nothing on the server changes.</p>}

      <p className="mt-6 text-sm font-semibold">What your browser just checked</p>
      <ul className="mt-2 space-y-2 text-sm">
        {checks.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden className={c.ok === true ? "text-allow" : c.ok === false ? "text-deny" : "text-faint"}>{c.ok === true ? "✓" : c.ok === false ? "✗" : "–"}</span>
            <span>{c.label}{c.detail && <span className="ml-2 font-mono text-xs text-faint">{c.detail}</span>}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
