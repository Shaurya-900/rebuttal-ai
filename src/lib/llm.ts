// One LLM adapter: JSON-only calls (no tools), Zod-validated, provider fallback on quota errors,
// and a record/replay cache keyed by a hash of the prompt so tests, eval re-runs and seeded demos cost nothing.
//   replay: cache only; a miss throws.   record: cache, else call and save.   live: always call.
// Provider request shapes are from public docs and are UNVERIFIED until a real key is used (docs/NEEDS-SHAURYA.md).
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { z } from "zod";

export type LlmRequest<T> = {
  purpose: string; // "quarantine" | "planner" | "baseline"
  system: string;
  user: string;
  schema: z.ZodType<T>;
  meta?: Record<string, string>; // trace/stub hints; not part of the cache key
  variant?: string; // eval run index ("run2"...): part of the cache key so repeated runs are separate recordings
};
export type Provider = { name: string; model: string; call: (system: string, user: string) => Promise<string> };
export type LlmCallRecord = { purpose: string; key: string; from: "cache" | "provider"; recordedFrom: string; meta?: Record<string, string> };
export type Llm = { json<T>(req: LlmRequest<T>): Promise<T>; calls: LlmCallRecord[] };

type Cassette = { purpose: string; recordedFrom: string; recordedAt: string; response: string };

export class QuotaError extends Error {
  constructor(msg: string, public readonly retryAfterMs = 0) { super(msg); }
}

export function cacheKey(purpose: string, system: string, user: string, variant?: string): string {
  const parts = variant ? [purpose, system, user, variant] : [purpose, system, user]; // no variant -> same keys as before
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex").slice(0, 32);
}

export function createLlm(opts: {
  mode: "record" | "replay" | "live";
  providers: Provider[];
  cacheDir: string;
  maxCalls?: number; // hard cap on provider calls for this instance
  reserve?: () => Promise<void>; // called before every provider call; throws to refuse (shared daily cap, src/lib/limits.ts)
}): Llm {
  const calls: LlmCallRecord[] = [];
  let providerCalls = 0;
  return {
    calls,
    async json<T>(req: LlmRequest<T>): Promise<T> {
      const key = cacheKey(req.purpose, req.system, req.user, req.variant);
      const file = join(opts.cacheDir, `${key}.json`);
      const cached: Cassette | null = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
      // A stand-in ("stub") answer never blocks re-recording from a real model.
      const usable = cached && !(opts.mode === "record" && cached.recordedFrom.startsWith("stub"));
      if (opts.mode !== "live" && usable) {
        calls.push({ purpose: req.purpose, key, from: "cache", recordedFrom: cached.recordedFrom, meta: req.meta });
        return parseJson(req, cached.response);
      }
      if (opts.mode === "replay") throw new Error(`LLM replay miss for ${req.purpose} (${key}); run with REBUTTAL_LLM_MODE=record`);
      if (opts.maxCalls !== undefined && providerCalls >= opts.maxCalls) throw new Error("LLM call cap reached");

      let lastErr: unknown;
      for (const p of opts.providers) {
        try {
          providerCalls++;
          await opts.reserve?.();
          const text = await p.call(req.system, req.user);
          const value = parseJson(req, text); // validate before saving: never cache a bad answer
          const recordedFrom = `${p.name}:${p.model}`;
          mkdirSync(opts.cacheDir, { recursive: true });
          const c: Cassette = { purpose: req.purpose, recordedFrom, recordedAt: new Date().toISOString(), response: text };
          writeFileSync(file, JSON.stringify(c, null, 2) + "\n");
          calls.push({ purpose: req.purpose, key, from: "provider", recordedFrom, meta: req.meta });
          return value;
        } catch (e) {
          lastErr = e;
          if (!(e instanceof QuotaError)) throw e; // only quota errors fall through to the next provider
        }
      }
      throw lastErr ?? new Error("no LLM providers configured");
    },
  };
}

function parseJson<T>(req: LlmRequest<T>, text: string): T {
  const body = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  const r = req.schema.safeParse(JSON.parse(body));
  if (!r.success) throw new Error(`LLM output failed schema for ${req.purpose}: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return r.data;
}

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<unknown> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  if (res.status === 429) throw new QuotaError(`429 from ${new URL(url).host}`, retryAfterMs(res.headers));
  if (!res.ok) throw new Error(`LLM HTTP ${res.status} from ${new URL(url).host}`); // body omitted: may echo the prompt
  return res.json();
}

// Groq sends "retry-after" (seconds) and x-ratelimit-reset-tokens ("1m26.4s", "577ms"). Longest wait wins.
function retryAfterMs(h: Headers): number {
  const dur = (v: string | null) => {
    if (!v) return 0;
    let ms = 0;
    for (const [, n, u] of v.matchAll(/([\d.]+)(ms|h|m|s)/g)) ms += Number(n) * { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[u as "ms"];
    return ms;
  };
  const ra = Number(h.get("retry-after"));
  return Math.max(Number.isFinite(ra) ? ra * 1000 : 0, dur(h.get("x-ratelimit-reset-tokens")));
}

export function geminiProvider(key: string, model = "gemini-2.5-flash"): Provider {
  return {
    name: "gemini",
    model,
    async call(system, user) {
      const j = (await post(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { "x-goog-api-key": key }, {
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      })) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const text = j.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("gemini: empty response");
      return text;
    },
  };
}

export function groqProvider(key: string, model = "openai/gpt-oss-120b"): Provider {
  return {
    name: "groq",
    model,
    async call(system, user) {
      const j = (await post("https://api.groq.com/openai/v1/chat/completions", { authorization: `Bearer ${key}` }, {
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      })) as { choices?: { message?: { content?: string } }[] };
      const text = j.choices?.[0]?.message?.content;
      if (!text) throw new Error("groq: empty response");
      return text;
    },
  };
}

export const LLM_CACHE_DIR = join(process.cwd(), "fixtures", "llm-cache");

/** Reads only the LLM variables, so offline tests do not need PayPal env vars. */
export function llmFromEnv(e: NodeJS.ProcessEnv = process.env, reserve?: () => Promise<void>, cacheDir = LLM_CACHE_DIR): Llm {
  const mode = (e.REBUTTAL_LLM_MODE ?? "replay") as "record" | "replay" | "live";
  return createLlm({ mode, providers: providersFromEnv(e), cacheDir, maxCalls: Number(e.DAILY_LLM_CALL_CAP ?? 200), reserve });
}

/** The configured model providers, in fallback order. Empty when no key is set. */
export function providersFromEnv(e: NodeJS.ProcessEnv = process.env): Provider[] {
  const providers: Provider[] = [];
  // First provider uses REBUTTAL_LLM_KEY / REBUTTAL_LLM_MODEL; fallbacks use REBUTTAL_LLM_KEY_<NAME> / REBUTTAL_LLM_MODEL_<NAME>.
  (e.REBUTTAL_LLM_PROVIDER ?? "gemini").split(",").map((n) => n.trim()).forEach((name, i) => {
    const key = i === 0 ? e.REBUTTAL_LLM_KEY : e[`REBUTTAL_LLM_KEY_${name.toUpperCase()}`];
    const model = (i === 0 ? e.REBUTTAL_LLM_MODEL : e[`REBUTTAL_LLM_MODEL_${name.toUpperCase()}`]) || undefined;
    if (!key) return;
    if (name === "gemini") providers.push(geminiProvider(key, model));
    if (name === "groq") providers.push(groqProvider(key, model));
  });
  return providers;
}

/** Replays recorded answers first and asks a live model only on a miss: recorded attacks cost nothing. */
export function layeredLlm(replay: Llm, live: Llm): Llm {
  const calls: LlmCallRecord[] = [];
  return {
    calls,
    async json<T>(req: LlmRequest<T>): Promise<T> {
      try {
        const v = await replay.json(req);
        calls.push(replay.calls.at(-1)!);
        return v;
      } catch (e) {
        if (!(e instanceof Error && e.message.startsWith("LLM replay miss"))) throw e;
        const v = await live.json(req);
        calls.push(live.calls.at(-1)!);
        return v;
      }
    },
  };
}
