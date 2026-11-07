-- merchant_daily: daily per-merchant aggregate (engineering_spec §3).
-- Uses Timescale (hypertable + continuous aggregate) when available (Tiger Data); otherwise a plain
-- table + materialized view with the same columns. bluff_meta.agg_mode records which one is active.
DO $mig$
DECLARE has_ts boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb') INTO has_ts;
  IF has_ts THEN
    BEGIN
      CREATE EXTENSION IF NOT EXISTS timescaledb;
      PERFORM create_hypertable('transactions', 'ts', chunk_time_interval => INTERVAL '7 days', migrate_data => true, if_not_exists => true);
      INSERT INTO bluff_meta VALUES ('agg_mode', 'timescale') ON CONFLICT (key) DO UPDATE SET value = 'timescale';
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'timescaledb unavailable (%), using plain Postgres fallback', SQLERRM;
      has_ts := false;
    END;
  END IF;
  IF NOT has_ts THEN
    INSERT INTO bluff_meta VALUES ('agg_mode', 'matview') ON CONFLICT (key) DO UPDATE SET value = 'matview';
  END IF;
END
$mig$;

DO $mig$
BEGIN
  IF (SELECT value FROM bluff_meta WHERE key = 'agg_mode') = 'matview' THEN
    CREATE MATERIALIZED VIEW IF NOT EXISTS merchant_daily AS
      SELECT date_trunc('day', ts) AS day, user_id, descriptor_norm,
             count(*)::int AS txn_count, sum(amount_cents)::bigint AS sum_cents,
             avg(amount_cents)::int AS avg_cents, max(amount_cents) AS max_cents
      FROM transactions GROUP BY 1, 2, 3;
    CREATE UNIQUE INDEX IF NOT EXISTS merchant_daily_pk ON merchant_daily (day, user_id, descriptor_norm);
  END IF;
END
$mig$;
