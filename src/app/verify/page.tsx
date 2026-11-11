import Link from "next/link";
import { getDb } from "../../lib/db/client";
import { recentRuns } from "../../lib/desk";
import Verifier from "./verifier";
import { NextStep, RouteBar } from "../flow";

export const dynamic = "force-dynamic";

export default async function Verify({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  const runs = (await recentRuns(getDb(), 20)).map((r) => ({ id: Number(r.id), scenario: r.scenario, choice: r.choice }));
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <RouteBar current={3} />
      <h1 className="mt-8 text-3xl font-extrabold tracking-tight sm:text-4xl">Check the receipts</h1>
      <p className="mt-3 max-w-2xl leading-relaxed text-graphite">
        Every run is written to a log that can&apos;t be edited, with each entry chained to the one before by its hash. Your browser re-checks
        it below with its own maths, without trusting the server. Then tamper with it and watch the check fail.
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
      <NextStep href="/desk/live" action="Last stop: real PayPal disputes">
        You have walked all three doors. One more thing worth a look: the same firewall reading real PayPal sandbox disputes, live, with nothing sent.
      </NextStep>
    </main>
  );
}
