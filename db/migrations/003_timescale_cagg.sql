-- no-transaction
-- only-if: agg_mode=timescale
-- Continuous aggregate (Timescale only; skipped on plain Postgres by the runner).
-- Cannot be exercised locally (no timescaledb in the dev image): verify on Tiger Data [verify].
CREATE MATERIALIZED VIEW IF NOT EXISTS merchant_daily WITH (timescaledb.continuous) AS
  SELECT time_bucket('1 day', ts) AS day, user_id, descriptor_norm,
         count(*)::int AS txn_count, sum(amount_cents)::bigint AS sum_cents,
         avg(amount_cents)::int AS avg_cents, max(amount_cents) AS max_cents
  FROM transactions GROUP BY 1, 2, 3 WITH NO DATA;
SELECT add_continuous_aggregate_policy('merchant_daily', start_offset => INTERVAL '120 days', end_offset => NULL, schedule_interval => INTERVAL '5 minutes', if_not_exists => true);
