// The story through the site: three chapters in order, shown in the header, and one clear next step at the end of
// every page, so a visitor never has to guess where to click.
import Link from "next/link";

export const CHAPTERS = [
  { n: 1, href: "/desk", title: "Watch it decide" },
  { n: 2, href: "/eval", title: "Try to fool it" },
  { n: 3, href: "/verify", title: "Check the receipts" },
] as const;

/** The one action that closes a page. */
export function NextStep({ href, action, children }: { href: string; action: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  const cls = "btn-primary px-6 py-3 text-base";
  return (
    <section aria-label="Next step" className="mt-16 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 border-t border-rule pt-8">
      <p className="max-w-xl text-base leading-relaxed text-graphite">{children}</p>
      {external ? <a href={href} className={cls}>{action}</a> : <Link href={href} className={cls}>{action} →</Link>}
    </section>
  );
}
