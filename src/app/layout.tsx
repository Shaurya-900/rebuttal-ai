import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { NavLinks } from "./nav";

const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata = { title: "Rebuttal", description: "A PayPal dispute agent that cannot be talked out of the rules." };

// Four places, in the order of the route (src/app/flow.tsx). Everything else lives in the footer.
const NAV = [
  ["/desk", "Watch"],
  ["/eval", "Try to fool it"],
  ["/verify", "Receipts"],
  ["/dashboard", "Dashboard"],
] as const;
const MORE = [
  ["/desk/live", "Live PayPal disputes"],
  ["/desk/policy", "Mira's policy"],
  ["/store", "Sandbox store"],
] as const;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:rounded focus:bg-act focus:px-3 focus:py-1.5 focus:text-act-ink">Skip to content</a>
        <header className="border-b border-rule">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 py-4">
            <Link href="/" className="text-lg font-extrabold tracking-tight text-ink">Rebuttal</Link>
            <nav aria-label="Main" className="-mx-1 flex flex-wrap gap-x-1 text-sm text-graphite">
              <NavLinks items={NAV} />
            </nav>
          </div>
          <p className="border-t border-rule bg-hold-tint/60 px-4 py-1.5 text-center text-xs text-hold">
            PayPal sandbox only. Every buyer, order, carrier and message in the demo is synthetic.
          </p>
        </header>
        <div id="main">{children}</div>
        <footer className="mt-20 border-t border-rule">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-8 gap-y-3 px-4 py-6 text-sm">
            <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-1">
              {MORE.map(([href, label]) => <Link key={href} href={href} className="text-graphite hover:text-ink hover:underline">{label}</Link>)}
              <a href="https://github.com/Shaurya-900/rebuttal-ai" className="text-graphite hover:text-ink hover:underline">Code (MIT)</a>
            </nav>
            <p className="text-xs text-faint">Built for the PayPal AI Hackathon 2026. Not affiliated with PayPal.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
