"use server";
// One turn of "play the buyer". Recorded answers replay for free; anything new asks the live model, within limits.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chatTurn, MAX_CHARS, MAX_TURNS, type ChatOutcome } from "../../lib/chat";
import { getDb } from "../../lib/db/client";
import { clientIp } from "../../lib/ip";
import { bump, dailyLlmCap, HOUR, ipBucket, LimitError } from "../../lib/limits";
import { createLlm, layeredLlm, LLM_CACHE_DIR, providersFromEnv, QuotaError } from "../../lib/llm";
import { currentPolicy } from "../../lib/policy";

export type ChatReply = { ok: true; outcome: ChatOutcome } | { ok: false; error: string };
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export async function sendBuyerMessage(mine: string[]): Promise<ChatReply> {
  if (!Array.isArray(mine) || mine.length === 0 || mine.length > MAX_TURNS || mine.some((m) => typeof m !== "string" || !m.trim() || m.length > MAX_CHARS))
    return { ok: false, error: `Up to ${MAX_TURNS} messages of ${MAX_CHARS} characters each.` };
  const db = getDb();
  if (!(await bump(db, `chat:${ipBucket(await clientIp())}`, HOUR, num(process.env.CHAT_PER_IP_PER_HOUR, 30))).ok)
    return { ok: false, error: "That's a lot of attempts from one address. Take a break and come back in an hour." };
  if (!(await bump(db, "chat:global", HOUR, num(process.env.CHAT_GLOBAL_PER_HOUR, 600))).ok)
    return { ok: false, error: "The demo is busy right now. Try again in a few minutes." };

  const replay = createLlm({ mode: "replay", providers: [], cacheDir: LLM_CACHE_DIR });
  const live = createLlm({
    mode: "record", // reads this server's own cache first, so a repeated attack costs one call, once
    providers: providersFromEnv(),
    cacheDir: process.env.CHAT_CACHE_DIR || join(tmpdir(), "rebuttal-chat-cache"),
    reserve: dailyLlmCap(db, num(process.env.DAILY_LLM_CALL_CAP, 200)),
  });
  try {
    const { policy } = await currentPolicy(db);
    return { ok: true, outcome: await chatTurn(layeredLlm(replay, live), mine.map((m) => m.trim()), policy) };
  } catch (e) {
    if (e instanceof QuotaError) return { ok: false, error: "The model is out of breath (rate limit). Wait a minute and send it again." };
    if (e instanceof LimitError) return { ok: false, error: "Today's model budget is used up. The suggested attacks still work: their answers are recorded." };
    if (e instanceof Error && e.message === "no LLM providers configured")
      return { ok: false, error: "The live model isn't switched on for this site, so only the suggested attacks work here." };
    console.error("chat turn failed:", e instanceof Error ? e.message : e);
    return { ok: false, error: "Something went wrong reading that. Try rewording it." };
  }
}
