-- Live Nessie: each Capital One Nessie purchase is mirrored into a visitor's transactions at most once.
-- 1. Drop duplicate mirrored rows (concurrent syncs could insert one purchase twice). Keep the row a dispute points to,
--    else the earliest.
DELETE FROM transactions t
 USING (
   SELECT id, ts, row_number() OVER (
            PARTITION BY user_id, external_id
            ORDER BY (EXISTS (SELECT 1 FROM disputes d WHERE d.txn_id = x.id)) DESC, ts, id) AS rn
     FROM transactions x
    WHERE external_id IS NOT NULL
 ) dup
 WHERE t.id = dup.id AND t.ts = dup.ts AND dup.rn > 1;

-- 2. One row per (user, purchase). On TimescaleDB `transactions` is a hypertable, where a unique index must include the
--    partitioning column (ts), so the index is created only where Postgres allows it. Imports are also serialized per
--    visitor in the app (advisory lock + NOT EXISTS, lib/nessie/rows.ts), which holds on both.
DO $mig$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS transactions_user_external_uniq ON transactions (user_id, external_id) WHERE external_id IS NOT NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'transactions_user_external_uniq skipped (%); imports rely on the per-visitor lock', SQLERRM;
END
$mig$;
