import type { ReactNode } from "react";

export const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
export const gateTone = (k?: string | null) => (k === "ALLOW" ? "green" : k === "DENY" ? "red" : k ? "amber" : "neutral");

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "amber" | "red" }) {
  const c = { neutral: "bg-neutral-100 text-neutral-700", green: "bg-emerald-100 text-emerald-800", amber: "bg-amber-100 text-amber-900", red: "bg-red-100 text-red-800" }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}
