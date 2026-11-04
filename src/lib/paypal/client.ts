// Minimal PayPal REST client. Never logs the secret or token.
import { z } from "zod";
import { env, paypalEnv } from "../../env";

let token: { value: string; expiresAt: number } | undefined;

export async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const e = paypalEnv();
  const res = await fetch(`${e.PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${e.PAYPAL_CLIENT_ID}:${e.PAYPAL_CLIENT_SECRET}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`PayPal token failed: ${res.status}`);
  const data = z.object({ access_token: z.string(), expires_in: z.number() }).parse(await res.json());
  token = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return token.value;
}

export type PpResponse = { status: number; ok: boolean; debugId: string | null; body: unknown };

export class PayPalError extends Error {
  constructor(public readonly res: PpResponse, what: string) {
    // name + issue only: PayPal error bodies never contain our secret, but keep messages short for the trace.
    const b = res.body as { name?: string; details?: { issue?: string }[] } | null;
    super(`${what}: HTTP ${res.status} ${b?.name ?? ""} ${b?.details?.[0]?.issue ?? ""} (debug_id ${res.debugId})`.trim());
  }
}

/** One request. `path` may be a full HATEOAS href or a path under PAYPAL_BASE_URL. */
export async function ppRequest(
  method: string,
  path: string,
  opts: { json?: unknown; form?: FormData; requestId?: string } = {},
): Promise<PpResponse> {
  const url = path.startsWith("https://") ? path : `${paypalEnv().PAYPAL_BASE_URL}${path}`;
  if (!url.startsWith(paypalEnv().PAYPAL_BASE_URL)) throw new Error(`refusing to send the token to ${new URL(url).host}`);
  const headers: Record<string, string> = { Authorization: `Bearer ${await accessToken()}` };
  if (opts.json !== undefined) headers["Content-Type"] = "application/json";
  if (opts.requestId) headers["PayPal-Request-Id"] = opts.requestId;
  const res = await fetch(url, { method, headers, body: opts.form ?? (opts.json !== undefined ? JSON.stringify(opts.json) : undefined) });
  const text = await res.text();
  let body: unknown = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, ok: res.ok, debugId: res.headers.get("paypal-debug-id"), body };
}

/** Parses only the fields we use (schemas are loose), so an unrelated PayPal change cannot break us. */
export function parseOk<T>(res: PpResponse, schema: z.ZodType<T>, what: string): T {
  if (!res.ok) throw new PayPalError(res, what);
  const r = schema.safeParse(res.body);
  if (!r.success) throw new Error(`${what}: unexpected response shape (${r.error.issues.map((i) => i.path.join(".")).join(", ")}; debug_id ${res.debugId})`);
  return r.data;
}

/** "10.00" -> 1000. Integer cents only; rejects anything that is not a plain decimal with <= 2 places. */
export function toCents(value: string): number {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!m) throw new Error(`bad money value ${JSON.stringify(value)}`);
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}
export const fromCents = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, "0")}`;

const WEBHOOK_HEADERS = {
  auth_algo: "paypal-auth-algo",
  cert_url: "paypal-cert-url",
  transmission_id: "paypal-transmission-id",
  transmission_sig: "paypal-transmission-sig",
  transmission_time: "paypal-transmission-time",
} as const;

/** Asks PayPal to verify a webhook delivery (POST /v1/notifications/verify-webhook-signature). */
export async function verifyWebhook(headers: Headers, event: unknown): Promise<boolean> {
  const fields: Record<string, string> = {};
  for (const [k, h] of Object.entries(WEBHOOK_HEADERS)) {
    const v = headers.get(h);
    if (!v) return false;
    fields[k] = v;
  }
  const res = await ppRequest("POST", "/v1/notifications/verify-webhook-signature", {
    json: { ...fields, webhook_id: env().PAYPAL_WEBHOOK_ID, webhook_event: event },
  });
  if (!res.ok) return false;
  const body = z.object({ verification_status: z.string() }).safeParse(res.body);
  return body.success && body.data.verification_status === "SUCCESS";
}
