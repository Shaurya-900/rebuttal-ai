import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cacheKey, createLlm, QuotaError, type Provider } from "./llm";

const schema = z.object({ ok: z.boolean() });
const req = { purpose: "t", system: "s", user: "u", schema };
const dir = () => mkdtempSync(join(tmpdir(), "llm-"));
const fixed = (name: string, out: string | Error): Provider & { n: number } => {
  const p = { name, model: "m", n: 0, async call() { p.n++; if (out instanceof Error) throw out; return out; } };
  return p;
};

describe("llm adapter", () => {
  it("replay mode throws on a cache miss and never calls a provider", async () => {
    const p = fixed("a", '{"ok":true}');
    await expect(createLlm({ mode: "replay", providers: [p], cacheDir: dir() }).json(req)).rejects.toThrow(/replay miss/);
    expect(p.n).toBe(0);
  });

  it("record then replay returns the same answer without a second call", async () => {
    const d = dir();
    const p = fixed("a", '```json\n{"ok":true}\n```');
    expect(await createLlm({ mode: "record", providers: [p], cacheDir: d }).json(req)).toEqual({ ok: true });
    const r = createLlm({ mode: "replay", providers: [], cacheDir: d });
    expect(await r.json(req)).toEqual({ ok: true });
    expect(r.calls[0]).toMatchObject({ from: "cache", recordedFrom: "a:m" });
    expect(p.n).toBe(1);
  });

  it("an answer that fails the schema is rejected and not cached", async () => {
    const d = dir();
    await expect(createLlm({ mode: "record", providers: [fixed("a", '{"ok":"yes"}')], cacheDir: d }).json(req)).rejects.toThrow(/schema/);
    expect(existsSync(join(d, `${cacheKey("t", "s", "u")}.json`))).toBe(false);
  });

  it("falls back to the next provider only on quota errors", async () => {
    const b = fixed("b", '{"ok":true}');
    await expect(createLlm({ mode: "live", providers: [fixed("a", new QuotaError("429")), b], cacheDir: dir() }).json(req)).resolves.toEqual({ ok: true });
    const c = fixed("c", '{"ok":true}');
    await expect(createLlm({ mode: "live", providers: [fixed("a", new Error("500")), c], cacheDir: dir() }).json(req)).rejects.toThrow("500");
    expect(c.n).toBe(0);
  });

  it("record mode replaces hand-written stub cassettes with real answers", async () => {
    const d = dir();
    const file = join(d, `${cacheKey("t", "s", "u")}.json`);
    writeFileSync(file, JSON.stringify({ purpose: "t", recordedFrom: "stub:hand-written", recordedAt: "", response: '{"ok":false}' }));
    expect(await createLlm({ mode: "replay", providers: [], cacheDir: d }).json(req)).toEqual({ ok: false });
    expect(await createLlm({ mode: "record", providers: [fixed("real", '{"ok":true}')], cacheDir: d }).json(req)).toEqual({ ok: true });
    expect(JSON.parse(readFileSync(file, "utf8")).recordedFrom).toBe("real:m");
  });

  it("enforces the call cap", async () => {
    const llm = createLlm({ mode: "live", providers: [fixed("a", '{"ok":true}')], cacheDir: dir(), maxCalls: 1 });
    await llm.json(req);
    await expect(llm.json(req)).rejects.toThrow(/cap/);
  });
});
