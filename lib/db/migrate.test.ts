import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { migrate } from "./migrate";

const ADMIN = "postgres://postgres:postgres@localhost:5432/postgres";
const DB = "bluff_migrate_test";
let pool: pg.Pool;

beforeAll(async () => {
  const admin = new pg.Pool({ connectionString: ADMIN });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:5432/${DB}` });
});
afterAll(async () => {
  await pool.end();
  const admin = new pg.Pool({ connectionString: ADMIN });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.end();
});

describe("migrations", () => {
  it("applies all tables, then is idempotent", async () => {
    const first = await migrate(pool);
    expect(first).toContain("001_init.sql");
    expect(await migrate(pool)).toEqual([]);
    const t = (await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'")).rows.map((r) => r.table_name);
    for (const n of ["users", "exposures", "transactions", "verdicts", "agent_runs", "agent_steps", "disputes", "messages", "taxonomy", "mock_registry", "allowlist", "game_cards", "game_plays"]) {
      expect(t).toContain(n);
    }
    // merchant_daily exists (matview fallback on plain Postgres) with the spec's columns.
    const cols = (await pool.query("SELECT attname FROM pg_attribute WHERE attrelid='merchant_daily'::regclass AND attnum>0")).rows.map((r) => r.attname);
    expect(cols).toEqual(expect.arrayContaining(["day", "user_id", "descriptor_norm", "txn_count", "sum_cents", "avg_cents", "max_cents"]));
    const idx = (await pool.query("SELECT indexname FROM pg_indexes WHERE indexname IN ('exposures_label_trgm','transactions_desc_trgm')")).rows;
    expect(idx).toHaveLength(2);
    expect((await pool.query("SELECT value FROM bluff_meta WHERE key='agg_mode'")).rows[0].value).toMatch(/matview|timescale/);
  });
});
