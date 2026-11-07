import pg from "pg";
import { getConfig } from "@/lib/config";

const g = globalThis as unknown as { __bluffPool?: pg.Pool };

function needsTls(url: string) {
  return /sslmode=require/.test(url) || (!/localhost|127\.0\.0\.1/.test(url) && !/sslmode=disable/.test(url));
}

/** One pool per process (survives Next hot reloads). */
export function getPool(): pg.Pool {
  if (!g.__bluffPool) {
    const url = getConfig().databaseUrl;
    g.__bluffPool = new pg.Pool({
      connectionString: url.replace(/[?&]sslmode=[^&]*/, ""),
      ssl: needsTls(url) ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    g.__bluffPool.on("error", (e) => console.error("[pg] idle client error", e.message));
  }
  return g.__bluffPool;
}

export async function closePool() {
  if (g.__bluffPool) { await g.__bluffPool.end(); g.__bluffPool = undefined; }
}
