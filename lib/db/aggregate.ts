import type pg from "pg";

/** Refresh merchant_daily: continuous aggregate (Timescale) or materialized view (fallback). */
export async function refreshMerchantDaily(db: pg.Pool | pg.PoolClient) {
  const mode = (await db.query("SELECT value FROM bluff_meta WHERE key='agg_mode'")).rows[0]?.value;
  if (mode === "timescale") {
    await db.query("CALL refresh_continuous_aggregate('merchant_daily', NULL, NULL)");
  } else {
    await db.query("REFRESH MATERIALIZED VIEW merchant_daily");
  }
}
