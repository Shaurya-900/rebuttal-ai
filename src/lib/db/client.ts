import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { Db } from "../exec/intents";

let db: Db | undefined;
// Reads only DATABASE_URL, so /desk works before a webhook id exists; the worker still validates everything via env().
export function getDb(): Db {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return (db ??= drizzle(new Pool({ connectionString: url })) as unknown as Db);
}
