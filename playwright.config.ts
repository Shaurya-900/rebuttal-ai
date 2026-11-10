// Judge flows in a real browser. Read-only against the app except "Run demo" (which stores a trace, counted by the per-IP limit).
//   BASE_URL=https://rebuttal-web.onrender.com npx playwright test      (hosted)
//   npx playwright test                                                (local: npm run db:dev + npm run dev first)
// Never automates PayPal's own pages.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 90_000, // a cold Render instance can take a while on the first request
  retries: 1,
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure" },
});
