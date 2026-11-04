import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-semibold">Rebuttal</h1>
      <p className="mt-3 text-neutral-600">
        A dispute-defense agent for PayPal sellers. The LLM proposes; a deterministic firewall decides. Runs against the PayPal
        sandbox only.
      </p>
      <div className="mt-6 flex gap-3">
        <Link href="/desk" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700">Open the dispute desk</Link>
        <Link href="/store" className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50">Sandbox store</Link>
      </div>
    </main>
  );
}
