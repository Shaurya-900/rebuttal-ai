import { defineConfig } from "vitest/config";

// Several test files each migrate an in-memory Postgres (PGlite) in beforeEach; in parallel that can pass 10 s.
export default defineConfig({ test: { hookTimeout: 30_000 } });
