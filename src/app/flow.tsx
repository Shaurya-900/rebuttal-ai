// The story through the site: three chapters in order, shown in the header, and one clear next step at the end of
// every page, so a visitor never has to guess where to click.
import Link from "next/link";

export const CHAPTERS = [
  { n: 1, href: "/desk", title: "Watch it decide" },
  { n: 2, href: "/eval", title: "Try to fool it" },
  { n: 3, href: "/verify", title: "Check the receipts" },
] as const;

/** How every page opens: a blue eyebrow, a big title, one lead paragraph (same as the chapter pages). */
export function PageHead({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">{title}</h1>
      {children && <p className="mt-3 max-w-2xl text-base leading-relaxed text-graphite sm:text-lg">{children}</p>}
    </>
  );
}

/** The one action that closes a page. */
export function NextStep({ href, action, children }: { href: string; action: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  const cls = "btn-primary btn-go";
  return (
    <section aria-label="Next step" className="card mt-10 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 overflow-hidden bg-gradient-to-br from-white to-sunk p-5 sm:mt-16 sm:p-8">
      <p className="max-w-md text-base leading-relaxed text-graphite"><span className="block font-semibold text-ink">What to do next</span>{children}</p>
      {external ? <a href={href} className={cls}>{action}</a> : <Link href={href} className={cls}>{action} →</Link>}
    </section>
  );
}
