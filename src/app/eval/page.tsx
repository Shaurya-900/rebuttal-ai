import Link from "next/link";

export default function Eval() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/desk" className="text-sm text-neutral-600 hover:underline">← Desk</Link>
      <h1 className="mt-2 text-2xl font-semibold">Adversarial evaluation</h1>
      <p className="mt-3 text-neutral-700">
        Not run yet. This page will show attack success rates per attack class for a naive single-model agent and for Rebuttal,
        on about 25 synthetic cases, 3 runs each, plus the false-block rate on honest cases and citation validity.
      </p>
      <p className="mt-3 text-sm text-neutral-500">
        Until then there are no numbers here, on purpose. The one example you can see today is the injection demo on the desk.
      </p>
    </main>
  );
}
