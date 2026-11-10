"use client";
// The AG Studio dashboard: three pages over Rebuttal's real data, a custom verdict-stamp widget, Rebuttal's theme,
// and an edit mode so anyone can build their own widgets over the same data (edits stay in their browser).
import { useMemo, useRef, useState } from "react";
import type { AgDataSourcesDefinition, AgFormat, AgReportState, AgStudioApi, AgStudioMode, AgWidgetLayoutState } from "ag-studio";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import type { DashboardData } from "../../lib/dashboard-data";
import { rebuttalStudioTheme } from "./studio-theme";
import { VerdictStamps } from "./verdict-stamps";

type FieldSpec = [id: string, name: string, format: AgFormat, hide?: boolean];
const fields = (specs: FieldSpec[]) => specs.map(([id, name, format, hide]) => ({ id, name, format, ...(hide && { hide }) }));
const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const title = (text: string) => ({ title: { enabled: true, text } });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const kpi = (text: string, value: { id: string; aggregation?: "sum" | "avg" | "countd" }) => ({
  type: "value" as const, dataMapping: { value: [value] }, format: { title: { enabled: true, text } },
});

function sources(d: DashboardData): AgDataSourcesDefinition {
  return {
    sources: [
      {
        id: "runs", name: "Agent runs", description: "Every agent run stored in the append-only log (synthetic scenarios). One row per run.",
        data: d.runs,
        fields: fields([
          ["id", "Run", "textFormat", true], ["at", "Run time", "dateTimeFormat"], ["scenario", "Scenario", "textFormat"],
          ["reason", "Dispute reason", "textFormat"], ["score", "Rubric score", "integerFormat"], ["decision", "Decision", "textFormat"],
          ["action", "Proposed action", "textFormat"], ["amount", "Money moved", "currencyFormat"], ["verdict", "Firewall verdict", "textFormat"],
          ["rule", "Rule that fired", "textFormat"], ["naiveVerdict", "Naive agent", "textFormat"], ["count", "Runs", "integerFormat"],
        ]),
      },
      {
        id: "attacks", name: "Attack evaluation", description: "Committed eval report: one row per synthetic case. Through = the attack caused a forbidden effect in any of 3 runs.",
        data: d.attacks,
        fields: fields([
          ["id", "Case id", "textFormat", true], ["caseTitle", "Case", "textFormat"], ["attackClass", "Class", "textFormat"],
          ["className", "Attack class", "textFormat"], ["rightAnswer", "Right answer", "textFormat"], ["naiveMeasured", "Naive agent measured", "textFormat"],
          ["naiveTried", "Naive agent: attacks tried", "integerFormat"], ["naiveThrough", "Naive agent: got through", "integerFormat"],
          ["rebuttalTried", "Rebuttal: attacks tried", "integerFormat"], ["rebuttalThrough", "Rebuttal: got through", "integerFormat"],
        ]),
      },
      {
        id: "live", name: "Sandbox disputes", description: "Real PayPal sandbox disputes, read live. Nothing is sent.",
        data: d.live,
        fields: fields([
          ["id", "Dispute", "textFormat"], ["reason", "Reason", "textFormat"], ["status", "PayPal status", "textFormat"], ["stage", "Stage", "textFormat"],
          ["amount", "Disputed", "currencyFormat"], ["recommendation", "Rebuttal would", "textFormat"], ["verdict", "Firewall verdict", "textFormat"],
          ["allowedActions", "Actions PayPal allows", "integerFormat"], ["count", "Disputes", "integerFormat"],
        ]),
      },
    ],
    expressions: [
      {
        id: "naiveRate", name: "Naive agent: success rate", description: "Attacks that got through the naive agent / attacks measured on it.",
        format: "percentageFormat", isMeasure: true, expression: { operator: "divide", inputs: [sum("attacks.naiveThrough"), sum("attacks.naiveTried")] },
      },
      {
        id: "rebuttalRate", name: "Rebuttal: success rate", description: "Attacks that got through Rebuttal / attacks tried on it.",
        format: "percentageFormat", isMeasure: true, expression: { operator: "divide", inputs: [sum("attacks.rebuttalThrough"), sum("attacks.rebuttalTried")] },
      },
    ],
  };
}

const firewall = {
  id: "firewall",
  widgets: {
    stamps: { type: "verdict-stamps", dataMapping: { category: [{ id: "runs.verdict" }], value: [sum("runs.count")] }, format: title("Firewall verdicts on every stored run") },
    "kpi-runs": kpi("Agent runs", sum("runs.count")),
    "kpi-money": kpi("Money the agent proposed to move", sum("runs.amount")),
    "kpi-score": kpi("Average rubric score", { id: "runs.score", aggregation: "avg" }),
    decisions: {
      type: "bar-chart-stacked",
      dataMapping: { categoryKey: [{ id: "runs.scenario" }], valueKey: [sum("runs.count")], legendKey: [{ id: "runs.verdict" }] },
      format: { ...title("Runs by scenario and verdict"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    "decision-donut": {
      type: "donut-chart",
      dataMapping: { categoryKey: [{ id: "runs.decision" }], valueKey: [sum("runs.count")] },
      format: title("Decisions"),
    },
    log: {
      type: "grid",
      dataMapping: { cols: [{ id: "runs.at" }, { id: "runs.scenario" }, { id: "runs.score", aggregation: "avg" }, { id: "runs.decision" }, { id: "runs.action" }, sum("runs.amount"), { id: "runs.verdict" }, { id: "runs.rule" }, { id: "runs.naiveVerdict" }] },
      sort: [{ field: { id: "runs.at" }, direction: "desc" }],
      format: title("Run log"),
    },
  },
  widgetLayout: {
    stamps: at(0, 0, 12, 12), "kpi-runs": at(12, 0, 4, 6), "kpi-money": at(16, 0, 4, 6), "kpi-score": at(20, 0, 4, 6),
    "decision-donut": at(12, 6, 12, 14), decisions: at(0, 12, 12, 16), log: at(0, 28, 24, 22),
  },
};

const attacks = {
  id: "attacks",
  widgets: {
    "naive-through": kpi("Naive agent: attacks that got through", sum("attacks.naiveThrough")),
    "naive-rate": kpi("Naive agent: success rate", { id: "naiveRate" }),
    "rebuttal-through": kpi("Rebuttal: attacks that got through", sum("attacks.rebuttalThrough")),
    "rebuttal-rate": kpi("Rebuttal: success rate", { id: "rebuttalRate" }),
    "by-class": {
      type: "bar-chart-grouped",
      dataMapping: { categoryKey: [{ id: "attacks.className" }], valueKey: [sum("attacks.naiveThrough"), sum("attacks.rebuttalThrough")] },
      format: { ...title("Attacks that got through, by class (synthetic cases, 3 runs each)"), style: { theme: { common: { legend: { enabled: true } } } } },
    },
    cases: {
      type: "grid",
      dataMapping: { cols: [{ id: "attacks.className" }, { id: "attacks.caseTitle" }, { id: "attacks.rightAnswer" }, { id: "attacks.naiveMeasured" }, sum("attacks.naiveThrough"), sum("attacks.rebuttalThrough")] },
      format: title("Every case. 1 = the attack caused a forbidden effect"),
    },
  },
  widgetLayout: {
    "naive-through": at(0, 0, 6, 6), "naive-rate": at(6, 0, 6, 6), "rebuttal-through": at(12, 0, 6, 6), "rebuttal-rate": at(18, 0, 6, 6),
    "by-class": at(0, 6, 24, 18), cases: at(0, 24, 24, 24),
  },
};

const live = {
  id: "live",
  widgets: {
    stamps: { type: "verdict-stamps", dataMapping: { category: [{ id: "live.verdict" }], value: [sum("live.count")] }, format: title("Firewall on live PayPal state") },
    "kpi-disputes": kpi("Sandbox disputes", sum("live.count")),
    "kpi-amount": kpi("Disputed", sum("live.amount")),
    disputes: {
      type: "grid",
      dataMapping: { cols: [{ id: "live.id" }, { id: "live.reason" }, { id: "live.status" }, { id: "live.stage" }, sum("live.amount"), sum("live.allowedActions"), { id: "live.recommendation" }, { id: "live.verdict" }] },
      format: title("Real sandbox disputes, read-only"),
    },
  },
  widgetLayout: { stamps: at(0, 0, 12, 12), "kpi-disputes": at(12, 0, 6, 12), "kpi-amount": at(18, 0, 6, 12), disputes: at(0, 12, 24, 16) },
};

const PAGES = [
  { id: "firewall", label: "Firewall" },
  { id: "attacks", label: "Attack evaluation" },
  { id: "live", label: "Live disputes" },
] as const;

// ponytail: the custom widget's registry is typed loosely (any) rather than with Studio's generic registry types;
// add a typed registry if more custom widgets arrive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const widgets: any = (defaults: any) =>
  createWidgets({
    additionalTypes: [
      {
        id: "verdict-stamps",
        label: "Verdict stamps",
        icon: { url: "/stamp-icon.svg" },
        dataMapping: {
          category: { type: "field", supportedRoles: ["category"], requires: { cardinality: "many" }, required: true, aiDescription: "The verdict or status to draw as stamps." },
          value: { type: "field", supportedRoles: ["numeric"], requires: { per: "dataMapping.category", cardinality: "one" }, required: true, aiDescription: "How many of each." },
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        form: (params: any) => params.createDefaults({ dataMappingItems: [{ key: "category", label: "Verdict" }, { key: "value", label: "Count" }] }),
        comp: VerdictStamps,
        defaultSize: { width: 420, height: 220 },
        minSize: { width: 220, height: 140 },
      },
    ],
    menu: [{ label: "Rebuttal", widgetIds: ["verdict-stamps"] }, ...defaults.menu],
  } as never);

export default function Studio({ data, licenseKey }: { data: DashboardData; licenseKey?: string }) {
  const apiRef = useRef<AgStudioApi | null>(null);
  const [page, setPage] = useState<string>("firewall");
  const [mode, setMode] = useState<AgStudioMode>("view");
  const studioData = useMemo(() => sources(data), [data]);
  // The pages use the custom "verdict-stamps" type, which Studio's default registry type does not list.
  const initialState = useMemo(() => ({ selectedPageId: "firewall", pages: [firewall, attacks, live], panels: { filters: { collapsed: true }, data: { collapsed: true } } }) as unknown as AgReportState, []);

  const show = (id: string) => {
    const api = apiRef.current;
    if (api) api.setState({ ...api.getState(), selectedPageId: id });
    setPage(id);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
        <div role="tablist" aria-label="Dashboard pages" className="flex flex-wrap gap-1">
          {PAGES.map((p) => (
            <button key={p.id} role="tab" aria-selected={page === p.id} onClick={() => show(p.id)}
              className={`rounded px-3 py-1.5 text-sm font-semibold ${page === p.id ? "bg-ink text-paper" : "text-graphite hover:bg-sunk hover:text-ink"}`}>
              {p.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setMode(mode === "view" ? "edit" : "view")} aria-pressed={mode === "edit"} className="btn-quiet py-1.5">
          {mode === "view" ? "Build your own widget" : "Done editing"}
        </button>
      </div>
      {mode === "edit" && (
        <p className="mt-2 text-xs text-graphite">Edit mode: drag fields onto the page or pick a widget, including the Rebuttal verdict stamps. Changes stay in your browser only.</p>
      )}
      <p className="mt-2 text-xs text-graphite sm:hidden">The dashboard is wide: scroll it sideways inside its frame.</p>
      {/* Studio's canvas has a minimum width; the frame scrolls on small screens so the page itself never does. */}
      <div className="mt-3 overflow-x-auto">
      <div className="h-[1200px] min-h-0 min-w-[960px]">
        <AgStudioProvider licenseKey={licenseKey}>
          <AgStudio
            style={{ height: "100%", width: "100%" }}
            theme={rebuttalStudioTheme}
            layout={{ widgetBorderEnabled: true }}
            data={studioData}
            widgets={widgets}
            initialState={initialState}
            mode={mode}
            onApiReady={(e) => { apiRef.current = e.api; }}
          />
        </AgStudioProvider>
      </div>
      </div>
    </div>
  );
}
