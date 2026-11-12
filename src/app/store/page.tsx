// Mira's synthetic storefront. Real PayPal sandbox checkout: create order -> approve on PayPal -> capture on return.
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createOrder } from "../../lib/paypal/orders";
import { PageHead } from "../flow";

export const dynamic = "force-dynamic";

const PRODUCT = { name: "Refurbished 35mm film camera", priceCents: 1000, note: "Synthetic demo listing. Sandbox money only." };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function buy() {
  "use server";
  const o = await origin();
  const { approveUrl } = await createOrder({
    amountCents: PRODUCT.priceCents,
    currency: "USD",
    description: `SYNTHETIC ${PRODUCT.name}`,
    returnUrl: `${o}/store/return`,
    cancelUrl: `${o}/store?cancelled=1`,
    requestId: `create-${randomUUID()}`,
  });
  redirect(approveUrl);
}

export default async function Store({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const { cancelled } = await searchParams;
  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <PageHead eyebrow="Sandbox store" title="Mira's Cameras">
        A synthetic shop with a real PayPal sandbox checkout, so a dispute can be opened on a real sandbox payment.
      </PageHead>
      <div className="card mt-8 p-5 sm:p-6">
        <h2 className="text-xl font-semibold tracking-tight">{PRODUCT.name}</h2>
        <p className="mt-1 text-graphite">Shutter tested at all speeds. Light wear on the base plate.</p>
        <p className="mt-1 text-sm text-faint">{PRODUCT.note}</p>
        <p className="mt-5 text-3xl font-semibold tracking-tight">${(PRODUCT.priceCents / 100).toFixed(2)}</p>
        <form action={buy} className="mt-4">
          {/* Our own button style on purpose: no imitation of PayPal's branded checkout button. */}
          <button className="btn-primary w-full py-3.5 text-base">Pay with the PayPal sandbox</button>
        </form>
        {cancelled && <p className="mt-3 text-sm text-graphite">Checkout cancelled. Nothing was charged.</p>}
      </div>
      <p className="mt-6 text-sm text-faint">
        Log in on PayPal with a sandbox <em>personal</em> account. After paying, open a dispute on that payment in the sandbox
        Resolution Center to give Rebuttal something to work on.
      </p>
    </main>
  );
}
