import { getDb } from "../../../../lib/db/client";
import { verifyWebhook } from "../../../../lib/paypal/client";
import { ingestWebhook } from "../../../../lib/paypal/webhooks";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(null, { status: 400 });
  }
  const r = await ingestWebhook(getDb(), body, (event) => verifyWebhook(req.headers, event));
  return new Response(null, { status: r.status });
}
