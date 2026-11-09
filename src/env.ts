// Env validated with Zod; call env() at boot so a bad config fails fast. Every key is documented in .env.example.
import { z } from "zod";

const schema = z.object({
  PAYPAL_CLIENT_ID: z.string().min(1),
  PAYPAL_CLIENT_SECRET: z.string().min(1),
  PAYPAL_BASE_URL: z.url().default("https://api-m.sandbox.paypal.com"),
  PAYPAL_WEBHOOK_ID: z.string().min(1),
  PAYPAL_BUYER_EMAIL: z.email().optional(),
  SANDBOX_SIMULATOR: z.stringbool().default(false),
  REBUTTAL_LLM_KEY: z.string().optional(),
  REBUTTAL_LLM_PROVIDER: z.string().default("gemini"),
  REBUTTAL_LLM_MODE: z.enum(["record", "replay", "live"]).default("replay"),
  DATABASE_URL: z.string().min(1),
  FAULT: z.enum(["crash_after_send", "crash_before_confirm", "timeout", ""]).default(""),
  DAILY_LLM_CALL_CAP: z.coerce.number().int().positive().default(200),
  PER_IP_RUNS_PER_HOUR: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_SALT: z.string().optional(),
  DESK_APPROVER_TOKEN: z.string().min(12).optional(), // unset = approvals disabled
});

export type Env = z.infer<typeof schema>;

// Subset for scripts and the PayPal client, which must work before a database or webhook exists.
const paypalSchema = schema.pick({ PAYPAL_CLIENT_ID: true, PAYPAL_CLIENT_SECRET: true, PAYPAL_BASE_URL: true, SANDBOX_SIMULATOR: true });
export function paypalEnv(): z.infer<typeof paypalSchema> {
  const r = paypalSchema.safeParse(process.env);
  if (!r.success) throw new Error(`Invalid environment: ${r.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  return r.data;
}

let cached: Env | undefined;
export function env(): Env {
  if (cached) return cached;
  const r = schema.safeParse(process.env);
  if (!r.success) {
    // Names only; never echo values.
    const bad = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid environment: ${bad}`);
  }
  if (r.data.SANDBOX_SIMULATOR && !r.data.PAYPAL_BASE_URL.includes("sandbox")) {
    throw new Error("SANDBOX_SIMULATOR=true is only allowed against the PayPal sandbox");
  }
  return (cached = r.data);
}
