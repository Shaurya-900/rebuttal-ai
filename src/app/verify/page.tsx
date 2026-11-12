import { getDb } from "../../lib/db/client";
import { recentRuns } from "../../lib/desk";
import Verifier from "./verifier";
import { NextStep } from "../flow";

export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const runs = (await recentRuns(getDb(), 20)).map((r) => ({ id: Number(r.id), scenario: r.scenario, choice: r.choice }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="pill w-fit"><span className="rounded-full bg-gradient-to-r from-brand-from to-brand-to px-2 py-0.5 text-xs font-medium text-white">Chapter 3</span>of 3</p>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight sm:text-5xl">Check the receipts</h1>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed text-graphite">
        Every run is written to a signed log that can&apos;t be edited. Your browser has just re-checked it on its own. Now tamper with it and watch it fail.
      </p>
      <details className="mt-3 max-w-2xl text-sm text-graphite">
        <summary className="cursor-pointer font-medium text-ink">How it works</summary>
        <p className="mt-2 leading-relaxed">
          Every agent run and policy change is a row in an append-only log. Each row is hashed (SHA-256), and each hash is chained to the one before
          it, so changing a single byte anywhere changes every link after it. The server signs the newest link with an Ed25519 key. Your browser
          recomputes all of it with WebCrypto.
        </p>
      </details>
      <Verifier runs={runs} initialRun={run ? Number(run) : runs.find((r) => r.choice === "FIGHT")?.id ?? null} />
      <p className="mt-10 text-xs text-faint">
        Limits: timestamps are the server&apos;s own, and the head is signed when this page asks for it. This shows the stored history has not been
        rewritten since it was chained; it does not prove when each row was written. Data in the runs is synthetic.
      </p>
      <NextStep href="/desk/live" action="Bonus: real PayPal disputes">
        That&apos;s the story. One more thing worth a look: the same firewall reading real PayPal sandbox disputes, live, with nothing sent.
      </NextStep>
    </main>
  );
}
