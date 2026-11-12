"use client";
// Custom AG Studio widget: each category (a firewall verdict) drawn as a labelled count, with its count.
// Data comes through Studio's own query API, so filters and cross-filtering on the page apply to it.
import { useEffect, useState } from "react";
import type { AgWidgetField, AgWidgetParams } from "ag-studio";

const INK: Record<string, string> = {
  allowed: "text-allow", denied: "text-deny", "held for seller": "text-hold", waiting: "text-graphite", "no action": "text-graphite",
};

// A mapped field is one of several Studio shapes; the data row is keyed by its id.
const key = (f: AgWidgetField) => (f as unknown as { id?: string }).id ?? "";

export function VerdictStamps({ widgetApi, dataMapping }: AgWidgetParams) {
  const [rows, setRows] = useState<{ label: string; count: number }[] | null>(null);
  const map = dataMapping as unknown as Record<string, AgWidgetField[] | undefined>;
  const category = map.category?.[0];
  const value = map.value?.[0];

  useEffect(() => {
    if (!category || !value) return;
    let live = true;
    void (async () => {
      widgetApi.setDisplayState("loading");
      const res = await widgetApi.getData({ fields: [category, value] });
      if (!live) return;
      // Rows are keyed by field; fall back to column order if the key format differs.
      setRows(res.results.rows.map((r) => {
        const vals = Object.values(r);
        return { label: String(r[key(category)] ?? vals[0] ?? ""), count: Number(r[key(value)] ?? vals[1] ?? 0) };
      }));
      widgetApi.setDisplayState("displayed");
    })();
    return () => { live = false; };
  }, [widgetApi, category, value]);

  if (!category || !value) return <p className="p-3 text-sm text-graphite">Map a category and a count to draw the stamps.</p>;
  if (!rows) return null;
  if (rows.length === 0) return <p className="p-3 text-sm text-graphite">No runs yet. Run a demo dispute on the desk.</p>;
  return (
    <div className="flex h-full flex-wrap content-center items-center justify-center gap-x-8 gap-y-5 p-3">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col items-center gap-2">
          <span className={`rounded-lg border border-current/30 px-3 py-1 text-sm font-semibold ${INK[r.label.toLowerCase()] ?? "text-ink"}`}>
            {r.label}
          </span>
          <span className="text-2xl font-semibold tabular-nums">{r.count}</span>
        </div>
      ))}
    </div>
  );
}
