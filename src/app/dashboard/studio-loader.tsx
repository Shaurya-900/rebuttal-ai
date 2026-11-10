"use client";
// AG Studio only runs in the browser, so it is loaded without server rendering.
import dynamic from "next/dynamic";
import type { DashboardData } from "../../lib/dashboard-data";

const Studio = dynamic(() => import("./studio"), {
  ssr: false,
  loading: () => <p className="py-10 text-sm text-graphite">Loading the dashboard…</p>,
});

export default function StudioLoader(props: { data: DashboardData; licenseKey?: string }) {
  return <Studio {...props} />;
}
