import pg from "pg";
import { migrate } from "../lib/db/migrate";
import { seedAll } from "../scripts/seed/seed";
import { MAYA_ID } from "../lib/config";
import { COOKIE_UID, signValue } from "../lib/session";

/** Cookie header for a session whose account is `userId` (default: the seeded persona Maya). Each session is its own account. */
export const sessionCookie = (userId: string = MAYA_ID) => ({ cookie: `${COOKIE_UID}=${encodeURIComponent(signValue(userId))}` });

/** Creates an isolated, migrated (and optionally seeded) database for one test file. */
export async function createTestDb(name: string, opts: { seed?: boolean; now?: Date } = {}) {
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
