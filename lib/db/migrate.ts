import fs from "node:fs";
import path from "node:path";
import type pg from "pg";

const DIR = path.join(process.cwd(), "db", "migrations");

function splitStatements(sql: string): string[] {
  return sql.split(/;[ \t]*\r?\n/).map((s) => s.trim()).filter((s) => s && !/^(--.*\n?)+$/.test(s));
}

/** Idempotent: applies db/migrations/*.sql not yet recorded in schema_migrations. Returns applied file names. */
export async function migrate(pool: pg.Pool, dir = DIR): Promise<string[]> {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const done = new Set((await pool.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name as string));
  const applied: string[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const only = /^-- only-if: (\w+)=(\w+)/m.exec(sql);
    if (only) {
      const r = await pool.query("SELECT value FROM bluff_meta WHERE key = $1", [only[1]]).catch(() => ({ rows: [] as { value: string }[] }));
      if (r.rows[0]?.value !== only[2]) {
        await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [`${file}`]);
        continue; // skipped (recorded so it is not retried; re-run manually if mode changes)
      }
    }
    const client = await pool.connect();
    try {
      if (/^-- no-transaction/m.test(sql)) {
        for (const stmt of splitStatements(sql)) await client.query(stmt);
      } else {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("COMMIT");
      }
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      applied.push(file);
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`migration ${file} failed: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return applied;
}
