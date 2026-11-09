import { sql } from "drizzle-orm";
import { getDb } from "../../../lib/db/client";

export const dynamic = "force-dynamic";

// Render's health check. 200 only if the database answers.
// ponytail: no worker heartbeat here; a dead worker must not make Render restart the web service. Add a heartbeat row if /desk needs to show worker status.
export async function GET() {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json({ ok: true, db: "up" });
  } catch {
    return Response.json({ ok: false, db: "down" }, { status: 503 }); // no error text: it can contain the connection string
  }
}
