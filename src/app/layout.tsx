import type { ReactNode } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { StoryNav } from "./nav";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

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
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Before paint: mark first visits so the home page's card-swipe intro shows without a flash (see intro.tsx). */}
        <script dangerouslySetInnerHTML={{ __html: `try{if(location.pathname==="/"&&!localStorage.getItem("rebuttal-entered"))document.documentElement.dataset.intro="1"}catch(e){}` }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-10 focus:rounded focus:bg-act focus:px-3 focus:py-1.5 focus:text-act-ink">Skip to content</a>
        <header className="sticky top-0 z-20 border-b border-rule/70 bg-white/70 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-brand-from to-brand-to text-sm font-bold text-white shadow-sm">R</span>
              <span className="text-lg font-semibold tracking-tight text-ink">Rebuttal</span>
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
