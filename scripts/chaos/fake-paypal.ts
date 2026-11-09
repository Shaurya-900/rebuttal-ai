// FAKE PayPal for the chaos test only. Lives in the parent process so its state survives kill -9 of workers.
// Models just what the executor touches: token, get dispute (with seller messages), send-message, get capture,
// refund. The effect is applied as soon as the request arrives; the response is then delayed 0-40 ms, so
// client timeouts produce "it happened but you didn't hear" cases. `idempotent` models PayPal-Request-Id replay.
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

export type FakeState = {
  disputes: Map<string, { captureId: string; messages: { posted_by: "SELLER"; content: string }[] }>;
  refunds: { captureId: string; id: string; note: string }[];
  requests: number;
};

const REF = /\[ref ([0-9a-f]{12})\]/;
export const refOf = (s: string) => REF.exec(s)?.[1] ?? null;

export async function startFakePaypal(o: { idempotent: boolean }) {
  const state: FakeState = { disputes: new Map(), refunds: [], requests: 0 };
  const replay = new Map<string, unknown>();
  let base = "";

  const body = (req: IncomingMessage) => new Promise<string>((res) => { let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => res(b)); });

  const server = createServer(async (req, res) => {
    state.requests++;
    const send = (status: number, json: unknown, delay = 0) =>
      setTimeout(() => { if (!res.destroyed) { res.writeHead(status, { "content-type": "application/json", "paypal-debug-id": `fake-${state.requests}` }); res.end(JSON.stringify(json)); } }, delay);
    const url = new URL(req.url ?? "/", base);
    const p = url.pathname.split("/").filter(Boolean);
    const text = await body(req);
    const rid = req.headers["paypal-request-id"] as string | undefined;
    const jitter = Math.floor(Math.random() * 40);

    if (req.method === "POST" && url.pathname === "/v1/oauth2/token") return send(200, { access_token: "fake-token", expires_in: 3600 });

    if (p[0] === "v1" && p[2] === "disputes" && p[3]) {
      const d = state.disputes.get(p[3]);
      if (!d) return send(404, { name: "RESOURCE_NOT_FOUND" });
      if (req.method === "GET" && !p[4]) {
        return send(200, {
          dispute_id: p[3], create_time: "2026-11-04T00:00:00Z", reason: "MERCHANDISE_OR_SERVICE_NOT_RECEIVED",
          status: "WAITING_FOR_SELLER_RESPONSE", dispute_life_cycle_stage: "INQUIRY",
          dispute_amount: { currency_code: "USD", value: "10.00" }, seller_response_due_date: "2099-01-01T00:00:00Z",
          disputed_transactions: [{ seller_transaction_id: d.captureId }], messages: d.messages,
          links: [{ rel: "self", href: `${base}/v1/customer/disputes/${p[3]}`, method: "GET" }, { rel: "send_message", href: `${base}/v1/customer/disputes/${p[3]}/send-message`, method: "POST" }],
        }, jitter);
      }
      if (req.method === "POST" && p[4] === "send-message") {
        if (o.idempotent && rid && replay.has(rid)) return send(200, replay.get(rid), jitter);
        d.messages.push({ posted_by: "SELLER", content: String(JSON.parse(text).message) }); // effect lands now
        const r = { links: [] };
        if (rid) replay.set(rid, r);
        return send(200, r, jitter);
      }
    }

    if (p[0] === "v2" && p[1] === "payments" && p[2] === "captures" && p[3]) {
      if (req.method === "GET" && !p[4]) return send(200, { id: p[3], status: "COMPLETED", amount: { currency_code: "USD", value: "10.00" } }, jitter);
      if (req.method === "POST" && p[4] === "refund") {
        if (o.idempotent && rid && replay.has(rid)) return send(201, replay.get(rid), jitter);
        const r = { id: `RF-${state.refunds.length + 1}`, status: "COMPLETED" };
        state.refunds.push({ captureId: p[3], id: r.id, note: String(JSON.parse(text).note_to_payer ?? "") }); // effect lands now
        if (rid) replay.set(rid, r);
        return send(201, r, jitter);
      }
    }
    send(404, { name: "NOT_FOUND", path: url.pathname });
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { state, base, close: () => new Promise<void>((r) => server.close(() => r())) };
}
