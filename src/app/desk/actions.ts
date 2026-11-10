"use server";
import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../../lib/db/client";
import { runDemo } from "../../lib/desk";
import { answerApproval } from "../../lib/exec/intents";
import { bump, HOUR } from "../../lib/limits";
import { savePolicy } from "../../lib/policy";

const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

/** Client IP as Render's proxy sees it: the LAST X-Forwarded-For entry (the first one is whatever the client sent). */
async function clientIp(): Promise<string> {
  const xff = (await headers()).get("x-forwarded-for");
  return xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "unknown";
}

export async function runScenario(form: FormData) {
  const db = getDb();
  const scenario = String(form.get("scenario"));
  // A global hourly ceiling too, so rotating IPs cannot fill the database.
  if (!(await bump(db, "run:global", HOUR, 600)).ok) redirect("/desk?limited=global");
  const r = await runDemo(db, scenario, await clientIp(), {
    perIpPerHour: num(process.env.PER_IP_RUNS_PER_HOUR, 20),
    dailyLlmCap: num(process.env.DAILY_LLM_CALL_CAP, 200),
  });
  if (r.kind === "rate_limited") redirect(`/desk?limited=${r.limit}`);
  redirect(`/desk/run/${r.runId}`);
}

function tokenOk(given: string): boolean {
  const want = process.env.DESK_APPROVER_TOKEN;
  if (!want || want.length < 12) return false; // approvals disabled on this deploy
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function answer(form: FormData) {
  const id = Number(form.get("intentId"));
  const choice = form.get("answer") === "approve" ? "approve" : "reject";
  if (!Number.isInteger(id) || !tokenOk(String(form.get("token") ?? ""))) redirect("/desk?approval=denied");
  const moved = await answerApproval(getDb(), id, choice);
  revalidatePath("/desk");
  redirect(`/desk?approval=${moved ? (choice === "approve" ? "approved" : "rejected") : "stale"}`);
}

/** /desk/policy: the seller's password is required, because the policy changes what the firewall allows. */
export async function updatePolicy(form: FormData) {
  if (!tokenOk(String(form.get("token") ?? ""))) redirect("/desk/policy?saved=denied");
  const dollars = (k: string) => Math.round(Number(form.get(k)) * 100);
  try {
    await savePolicy(getDb(), {
      maxOfferPct: form.get("maxOfferPct"),
      autoAcceptMaxCents: dollars("autoAcceptMax"),
      dailyRefundBudgetCents: dollars("dailyRefundBudget"),
      perBuyerCap30dCents: dollars("perBuyerCap30d"),
      repeatDisputerThreshold: form.get("repeatDisputerThreshold"),
      messageUrlAllowlist: String(form.get("messageUrlAllowlist") ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean),
    });
  } catch {
    redirect("/desk/policy?saved=invalid");
  }
  revalidatePath("/desk/policy");
  redirect("/desk/policy?saved=ok");
}
