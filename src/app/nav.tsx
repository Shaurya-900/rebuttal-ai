"use client";
// The header links, with the current section marked so a visitor always knows where they are.
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: readonly (readonly [string, string])[] }) {
  const path = usePathname();
  return (
    <>
      {items.map(([href, label]) => {
        const here = path === href || (href !== "/" && path.startsWith(href + "/") && !(href === "/desk" && path.startsWith("/desk/live")));
        return (
          <Link key={href} href={href} aria-current={here ? "page" : undefined}
            className={`rounded px-2 py-1 hover:bg-sunk hover:text-ink ${here ? "font-semibold text-ink underline decoration-2 underline-offset-[6px]" : ""}`}>
            {label}
          </Link>
        );
      })}
    </>
  );
}
