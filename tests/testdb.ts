import pg from "pg";
import { migrate } from "../lib/db/migrate";
import { seedAll } from "../scripts/seed/seed";
import { MAYA_ID } from "../lib/config";
import { COOKIE_UID, signValue } from "../lib/session";

/** Cookie header for a session whose account is `userId` (default: the seeded persona Maya). Each session is its own account. */
export const sessionCookie = (userId: string = MAYA_ID) => ({ cookie: `${COOKIE_UID}=${encodeURIComponent(signValue(userId))}` });

/** Creates an isolated, migrated (and optionally seeded) database for one test file. */
export async function createTestDb(baseName: string, opts: { seed?: boolean; now?: Date } = {}) {
  // TEST_DB_SUFFIX lets several checkouts (e.g. parallel worktrees) run the suite against one Postgres without colliding.
  const suffix = (process.env.TEST_DB_SUFFIX ?? "").replace(/[^a-z0-9_]/gi, "").toLowerCase();
  const name = suffix ? `${baseName}_${suffix}` : baseName;
  const admin = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/postgres" });
  await admin.query(`DROP DATABASE IF EXISTS ${name}`);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = `postgres://postgres:postgres@localhost:5432/${name}`;
  const pool = new pg.Pool({ connectionString: url });
  await migrate(pool);
  if (opts.seed) await seedAll(pool, opts.now);
  return {
    pool, url,
    async drop() {
      await pool.end();
      const a = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/postgres" });
      await a.query(`DROP DATABASE IF EXISTS ${name}`);
      await a.end();
    },
  };
}
