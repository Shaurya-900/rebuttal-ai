// The route through the site: three doors in order, a route bar that shows where you are, and one clear next step at
// the end of every page, so a visitor never has to guess where to click.
import Link from "next/link";

export const DOORS = [
  { n: 1, href: "/desk", title: "Watch a dispute get decided" },
  { n: 2, href: "/eval", title: "Try to fool it" },
  { n: 3, href: "/verify", title: "Check the receipts" },
] as const;

/** Where you are on the three-door route. `current` 0 = off the route (shown, nothing highlighted). */
export function RouteBar({ current }: { current: 0 | 1 | 2 | 3 }) {
  return (
    <nav aria-label="The three doors" className="border-b border-rule pb-4">
      <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        {DOORS.map((d) => {
          const here = d.n === current;
          const done = current > 0 && d.n < current;
          return (
            <li key={d.n}>
              <Link href={d.href} aria-current={here ? "step" : undefined}
                className={`inline-flex items-center gap-2 rounded py-1 hover:text-ink ${here ? "font-bold text-ink" : done ? "text-graphite" : "text-faint"}`}>
                <span aria-hidden className={`grid size-6 place-items-center rounded-full text-xs font-bold tabular-nums ${here ? "bg-ink text-paper" : "border border-rule"}`}>{d.n}</span>
                {d.title}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The one action that closes a page. */
export function NextStep({ href, action, children }: { href: string; action: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <section aria-label="Next step" className="mt-16 border-t-2 border-ink pt-6">
      <p className="max-w-2xl text-base leading-relaxed">{children}</p>
      {external ? (
        <a href={href} className="btn-primary mt-4">{action}</a>
      ) : (
        <Link href={href} className="btn-primary mt-4">{action}</Link>
      )}
    </section>
  );
}
