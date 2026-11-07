import type pg from "pg";
import { getPool } from "./pool";

export { getPool, closePool } from "./pool";

export type Db = pg.Pool | pg.PoolClient;

/** Run `fn` in a transaction; rolls back on throw. */
export async function withTx<T>(fn: (c: pg.PoolClient) => Promise<T>, pool: pg.Pool = getPool()): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export async function one<T extends pg.QueryResultRow>(db: Db, sql: string, args: unknown[] = []): Promise<T | null> {
  return (await db.query<T>(sql, args)).rows[0] ?? null;
}

export async function many<T extends pg.QueryResultRow>(db: Db, sql: string, args: unknown[] = []): Promise<T[]> {
  return (await db.query<T>(sql, args)).rows;
}
