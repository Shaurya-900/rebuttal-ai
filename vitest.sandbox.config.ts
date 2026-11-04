// `npm run test:sandbox`: hits the real PayPal sandbox. Run by hand, never in CI.
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["sandbox/**/*.sandbox.ts"], testTimeout: 60_000, fileParallelism: false } });
