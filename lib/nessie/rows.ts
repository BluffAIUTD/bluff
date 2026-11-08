import type pg from "pg";
import type { Db } from "../db";
import { normalizeDescriptor } from "../linker/normalize";

/** One Capital One Nessie purchase as a row of the visitor's `transactions` (source='nessie'). */
export type NessieRow = {
  externalId: string; ts: Date; descriptor: string; amountCents: number;
  category: string | null; merchantName: string; website: string | null;
};

const LOCK_NS = 7710; // advisory-lock namespace for Nessie imports

/**
 * Run `fn` holding this visitor's Nessie import lock. Imports (sync, live push) are serialized per visitor so a purchase
 * is mirrored at most once: on TimescaleDB `transactions` is a hypertable and can't carry a unique (user, purchase) index.
 */
export async function withNessieLock<T>(db: Db, userId: string, fn: (c: Db) => Promise<T>): Promise<T> {
  if ("release" in db) {
    // A checked-out client may already be inside a transaction: use the session-level lock.
    await db.query("SELECT pg_advisory_lock($1, hashtext($2))", [LOCK_NS, userId]);
    try { return await fn(db); } finally { await db.query("SELECT pg_advisory_unlock($1, hashtext($2))", [LOCK_NS, userId]).catch(() => {}); }
  }
  const c: pg.PoolClient = await (db as pg.Pool).connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [LOCK_NS, userId]);
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

/**
 * Insert purchases the visitor doesn't have yet (call inside withNessieLock). Returns the rows actually inserted.
 * NOT EXISTS + the lock dedupe everywhere; ON CONFLICT covers the unique index where migration 011 could create it.
 */
export async function insertNessieRows(c: Db, userId: string, rows: NessieRow[]): Promise<{ id: string; externalId: string }[]> {
  const seen = new Set<string>();
  const list = rows.filter((r) => !seen.has(r.externalId) && seen.add(r.externalId));
  if (!list.length) return [];
  const res = await c.query<{ id: string; external_id: string }>(
    `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, is_recurring, source, external_id, merchant_name, website)
     SELECT r.ts, $1, r.d, r.n, r.a, r.m, false, 'nessie', r.x, r.mn, r.w
       FROM unnest($2::timestamptz[], $3::text[], $4::text[], $5::int[], $6::text[], $7::text[], $8::text[], $9::text[]) AS r(ts, d, n, a, m, x, mn, w)
      WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.user_id = $1 AND t.external_id = r.x)
     ON CONFLICT DO NOTHING
     RETURNING id, external_id`,
    [
      userId, list.map((r) => r.ts), list.map((r) => r.descriptor), list.map((r) => normalizeDescriptor(r.descriptor) || r.descriptor.toLowerCase()),
      list.map((r) => r.amountCents), list.map((r) => r.category), list.map((r) => r.externalId), list.map((r) => r.merchantName), list.map((r) => r.website),
    ],
  );
  return res.rows.map((r) => ({ id: r.id, externalId: r.external_id }));
}
