// Minimal PayPal REST client. Never logs the secret or token.
import { z } from "zod";
import { env } from "../../env";

let token: { value: string; expiresAt: number } | undefined;

export async function accessToken(): Promise<string> {
  if (token && Date.now() < token.expiresAt - 60_000) return token.value;
  const e = env();
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
  const res = await fetch(`${env().PAYPAL_BASE_URL}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...fields, webhook_id: env().PAYPAL_WEBHOOK_ID, webhook_event: event }),
  });
  if (!res.ok) return false;
  const body = z.object({ verification_status: z.string() }).safeParse(await res.json());
  return body.success && body.data.verification_status === "SUCCESS";
}
