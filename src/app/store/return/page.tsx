// PayPal sends the buyer back here with ?token=<order id>. Capture is idempotent: an already-completed order is
// only read, and the capture call carries a PayPal-Request-Id derived from the order id, so a refresh never charges twice.
import Link from "next/link";
import type { ReactNode } from "react";
import { captureOrder, getOrder } from "../../../lib/paypal/orders";
import { PageHead } from "../../flow";

export const dynamic = "force-dynamic";

export default async function Return({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  if (!token || !/^[A-Z0-9]{5,40}$/.test(token)) return <Shell title="Missing order">No PayPal order id in the link.</Shell>;

  let captureId: string | undefined;
  let status: string;
  try {
    const order = await getOrder(token);
    if (order.status === "COMPLETED") {
      const cap = order.purchase_units[0]?.payments?.captures?.[0];
      captureId = cap?.id;
      status = cap?.status ?? order.status;
    } else if (order.status === "APPROVED") {
      const r = await captureOrder(token, `capture-${token}`);
      captureId = r.captureId;
      status = r.status;
    } else {
      return <Shell title="Not approved">Order {token} is {order.status}. Nothing was charged.</Shell>;
    }
  } catch (e) {
    return <Shell title="Payment failed">{e instanceof Error ? e.message : "Unknown error"}. Nothing was shown as paid.</Shell>;
  }

  return (
    <Shell title={status === "COMPLETED" ? "Thanks, payment received" : `Payment ${status}`}>
      <p>Order <code className="id">{token}</code></p>
      <p>Capture <code className="id">{captureId}</code>, status {status}</p>
      <p className="mt-4 text-graphite">
        To test Rebuttal: log in to the sandbox Resolution Center as this buyer, report a problem on this payment, and do not escalate it.
      </p>
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <PageHead eyebrow="Sandbox store" title={title} />
      <div className="card mt-8 space-y-1 p-5 text-sm sm:p-6">{children}</div>
      <Link href="/store" className="btn-quiet mt-6">← Back to the store</Link>
    </main>
  );
}
