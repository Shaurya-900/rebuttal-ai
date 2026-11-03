import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../../env";
import type { Db } from "../exec/intents";

let db: Db | undefined;
export function getDb(): Db {
  return (db ??= drizzle(new Pool({ connectionString: env().DATABASE_URL })) as unknown as Db);
}
