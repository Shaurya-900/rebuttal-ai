import { headers } from "next/headers";

/** Client IP as Render's proxy sees it: the LAST X-Forwarded-For entry (the first one is whatever the client sent). */
export async function clientIp(): Promise<string> {
  const xff = (await headers()).get("x-forwarded-for");
  return xff?.split(",").map((s) => s.trim()).filter(Boolean).at(-1) ?? "unknown";
}
