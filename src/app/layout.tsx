import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { StoryNav } from "./nav";

const sans = Public_Sans({ subsets: ["latin"], variable: "--font-public-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap" });

export const metadata = { title: "Rebuttal", description: "A PayPal dispute agent that cannot be talked out of the rules." };

// The header carries only the story (src/app/flow.tsx). Everything else lives in the footer.
const MORE = [
  ["/dashboard", "Dashboard"],
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
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-2">
              <span className="text-lg font-extrabold tracking-tight text-ink">Rebuttal</span>
              <span className="hidden text-xs text-hold sm:inline">PayPal sandbox · synthetic data</span>
            </Link>
            <nav aria-label="Main"><StoryNav /></nav>
          </div>
        </header>
        <div id="main">{children}</div>
        <footer className="mt-16 border-t border-rule">
          <div className="mx-auto flex max-w-5xl flex-wrap items-baseline justify-between gap-x-8 gap-y-3 px-4 py-6 text-sm">
            <nav aria-label="More" className="flex flex-wrap gap-x-5 gap-y-1">
              {MORE.map(([href, label]) => <Link key={href} href={href} className="text-graphite hover:text-ink hover:underline">{label}</Link>)}
              <a href="https://github.com/Shaurya-900/rebuttal-ai" className="text-graphite hover:text-ink hover:underline">Code (MIT)</a>
            </nav>
            <p className="text-xs text-faint">PayPal sandbox only; every buyer, order and message in the demo is synthetic. Built for the PayPal AI Hackathon 2026. Not affiliated with PayPal.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
