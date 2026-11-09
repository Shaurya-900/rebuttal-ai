// Local Postgres for `npm run dev` (no Docker, no install): npm run db:dev, then in another terminal
//   DATABASE_URL=postgres://postgres:dev@127.0.0.1:54329/rebuttal npm run dev
// Data lives in .devdb/ (gitignored). Ctrl+C stops it.
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const fresh = !existsSync(".devdb/PG_VERSION");
const pg = new EmbeddedPostgres({ databaseDir: ".devdb", user: "postgres", password: "dev", port: 54329, persistent: true, onLog: () => {} });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("rebuttal");
const url = "postgres://postgres:dev@127.0.0.1:54329/rebuttal";
const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
await pool.end();
console.log(`Postgres ready, migrations applied: DATABASE_URL=${url}`);
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
