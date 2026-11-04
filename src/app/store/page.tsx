// Mira's synthetic storefront. Real PayPal sandbox checkout: create order -> approve on PayPal -> capture on return.
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createOrder } from "../../lib/paypal/orders";

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
    <main className="mx-auto max-w-xl px-4 py-12">
      <p className="rounded bg-amber-100 px-3 py-2 text-sm text-amber-900">PayPal sandbox · synthetic store · no real money moves</p>
      <h1 className="mt-6 text-2xl font-semibold">Mira&apos;s Cameras</h1>
      <div className="mt-6 rounded-lg border border-neutral-200 p-5">
        <h2 className="text-lg font-medium">{PRODUCT.name}</h2>
        <p className="mt-1 text-neutral-600">Shutter tested at all speeds. Light wear on the base plate.</p>
        <p className="mt-1 text-sm text-neutral-500">{PRODUCT.note}</p>
        <p className="mt-4 text-xl font-semibold">${(PRODUCT.priceCents / 100).toFixed(2)}</p>
        <form action={buy} className="mt-4">
          <button className="w-full rounded-md bg-[#ffc439] px-4 py-3 font-semibold text-neutral-900 hover:brightness-95">
            Pay with PayPal (sandbox)
          </button>
        </form>
        {cancelled && <p className="mt-3 text-sm text-neutral-600">Checkout cancelled. Nothing was charged.</p>}
      </div>
      <p className="mt-6 text-sm text-neutral-500">
        Log in on PayPal with a sandbox <em>personal</em> account. After paying, open a dispute on that payment in the sandbox
        Resolution Center to give Rebuttal something to work on.
      </p>
    </main>
  );
}
