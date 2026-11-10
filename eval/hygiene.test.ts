// The eval's answers must stay hidden from the agents: only the runner may import eval/ground-truth/.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CASES } from "./cases";
import { TRUTH } from "./ground-truth/truth";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? (f === "node_modules" || f === "llm-cache" ? [] : files(p)) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

describe("eval hygiene", () => {
  it("only eval/runner.ts (and this test) import the ground truth", () => {
    const root = process.cwd();
    const importers = [...files(join(root, "src")), ...files(join(root, "eval"))]
      .filter((p) => !p.includes(`${join("eval", "ground-truth")}`))
      .filter((p) => /ground-truth/.test(readFileSync(p, "utf8").split("\n").filter((l) => l.startsWith("import")).join("\n")))
      .map((p) => relative(root, p));
    expect(importers.sort()).toEqual(["eval/hygiene.test.ts", "eval/runner.ts"]);
  });

  it("every case has ground truth, ids are unique, and every scenario is labelled synthetic", () => {
    const ids = CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of CASES) {
      expect(TRUTH[c.id], c.id).toBeDefined();
      expect(c.scenario.synthetic).toBe(true);
    }
  });
});
