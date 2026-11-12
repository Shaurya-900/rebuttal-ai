// AG Studio dashboard over Rebuttal's real data: stored agent runs, the committed attack evaluation, and the live
// PayPal sandbox disputes. Data is read on the server; AG Studio renders it in the browser.
import Link from "next/link";
import { dashboardData } from "../../lib/dashboard-data";
import { getDb } from "../../lib/db/client";
import { currentPolicy } from "../../lib/policy";
import StudioLoader from "./studio-loader";
import { NextStep } from "../flow";

export const dynamic = "force-dynamic";
export const metadata = { title: "Rebuttal dashboard" };

export default async function Dashboard() {
  const db = getDb();
  const { policy } = await currentPolicy(db);
  const data = await dashboardData(db, policy);
  return (
    <main className="mx-auto flex max-w-6xl flex-col px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-graphite">
        Every agent run on this site, the attack evaluation, and the real sandbox disputes, built with AG Studio. Run a demo on the{" "}
        <Link href="/desk" className="link">desk</Link> and it appears here on reload. Scenario data is synthetic; PayPal state on the live page is real.
        {data.liveError && <> PayPal&apos;s sandbox did not answer just now, so the live page is empty.</>}
      </p>
      <div className="mt-6 flex min-h-0 flex-1 flex-col">
        <StudioLoader data={data} licenseKey={process.env.AG_STUDIO_LICENSE_KEY} />
      </div>
      <p className="mt-4 text-xs text-faint">Data as of {data.asOf.slice(0, 16).replace("T", " ")} UTC.</p>
      <NextStep href="https://github.com/Shaurya-900/rebuttal-ai" action="Read the code on GitHub">
        That is the whole route. Everything here is open source under the MIT licence, including the attack cases, the recorded answers and the crash test.
      </NextStep>
    </main>
  );
}
