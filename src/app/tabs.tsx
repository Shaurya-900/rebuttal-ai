"use client";
// A few views of one page, one at a time. Panels are rendered on the server and stay mounted (hidden), so a chat
// in progress survives switching tabs.
import { useState, type ReactNode } from "react";

export function Tabs({ tabs, label }: { tabs: { id: string; label: string; hint: string; panel: ReactNode }[]; label: string }) {
  const [on, setOn] = useState(tabs[0]!.id);
  return (
    <div>
      <div role="tablist" aria-label={label} className="grid grid-cols-3 gap-2">
        {tabs.map((t, n) => {
          const sel = t.id === on;
          return (
            <button key={t.id} id={`tab-${t.id}`} role="tab" type="button" aria-selected={sel} aria-controls={`panel-${t.id}`} onClick={() => setOn(t.id)}
              className={`rounded-2xl border p-2.5 text-left text-sm sm:p-3 sm:text-base transition-colors ${sel ? "border-act bg-white shadow-[0_12px_32px_-16px_var(--brand-from)] ring-1 ring-act" : "border-rule bg-white/60 hover:border-graphite/40 hover:bg-white"}`}>
              <span className={`hidden text-xs font-semibold tabular-nums sm:block ${sel ? "text-act" : "text-faint"}`}>{n + 1}</span>
              <span className="block font-semibold leading-snug sm:mt-0.5">{t.label}</span>
              <span className="mt-0.5 hidden text-xs text-graphite sm:block">{t.hint}</span>
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div key={t.id} id={`panel-${t.id}`} role="tabpanel" aria-labelledby={`tab-${t.id}`} hidden={t.id !== on} className="mt-6">
          {t.panel}
        </div>
      ))}
    </div>
  );
}
