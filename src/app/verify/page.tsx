import Link from "next/link";
import { getDb } from "../../lib/db/client";
import { recentRuns } from "../../lib/desk";
import Verifier from "./verifier";

export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const runs = (await recentRuns(getDb(), 20)).map((r) => ({ id: Number(r.id), scenario: r.scenario, choice: r.choice }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <Link href="/desk" className="text-sm text-graphite hover:underline">← Desk</Link>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight">Verify the evidence ledger</h1>
      <p className="mt-2 text-sm text-graphite">
        Every agent run and policy change is a row in an append-only log. Each row is hashed, and each hash is chained to the one before it, so
        changing a single byte anywhere changes every link after it. The server signs the newest link with an Ed25519 key. Your browser now
        recomputes all of it itself, with its own SHA-256 and signature check, and does not trust the server&apos;s arithmetic.
      </p>
      <Verifier runs={runs} initialRun={run ? Number(run) : runs.find((r) => r.choice === "FIGHT")?.id ?? null} />
      <p className="mt-10 text-xs text-faint">
        Limits: timestamps are the server&apos;s own, and the head is signed when this page asks for it. This shows the stored history has not been
        rewritten since it was chained; it does not prove when each row was written. Data in the runs is synthetic.
      </p>
    </main>
  );
}
