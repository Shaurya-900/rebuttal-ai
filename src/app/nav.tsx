"use client";
// The three chapters in the header, with the current one marked and earlier ones ticked, so a visitor always knows
// where they are in the story and what comes next.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CHAPTERS } from "./flow";

function current(path: string): number {
  if (path === "/desk" || path.startsWith("/desk/run")) return 1;
  if (path.startsWith("/eval")) return 2;
  if (path.startsWith("/verify")) return 3;
  return 0;
}

export function StoryNav() {
  const here = current(usePathname());
  return (
    <ol aria-label="The story, in three chapters" className="flex items-center gap-1 text-sm sm:gap-2">
      {CHAPTERS.map((c, i) => {
        const on = c.n === here;
        const done = here > c.n;
        return (
          <li key={c.n} className="flex items-center gap-1 sm:gap-2">
            {i > 0 && <span aria-hidden className={`h-px w-3 sm:w-6 ${done || on ? "bg-ink" : "bg-rule"}`} />}
            <Link href={c.href} aria-current={on ? "step" : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg py-1 pl-1 pr-1 sm:pr-3 ${on ? "bg-sunk font-semibold text-ink" : done ? "text-ink hover:bg-sunk" : "text-graphite hover:bg-sunk hover:text-ink"}`}>
              <span aria-hidden className={`grid size-6 place-items-center rounded-md text-xs font-bold tabular-nums ${on ? "bg-act text-act-ink" : done ? "bg-ink text-paper" : "border border-rule bg-paper"}`}>
                {done ? "✓" : c.n}
              </span>
              <span className={on ? "" : "sr-only sm:not-sr-only"}>{c.title}</span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
