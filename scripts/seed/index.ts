import { getPool, closePool } from "../../lib/db/pool";
import { migrate } from "../../lib/db/migrate";
import { seedAll, seedGlobal } from "./seed";

(async () => {
  const pool = getPool();
  await migrate(pool);
  const has = (await pool.query("SELECT 1 FROM users WHERE id = '00000000-0000-4000-8000-000000000001'")).rowCount;
  if (has) {
    // Global reference data (demo registry, allowlist, taxonomy, card pool) is idempotent and safe to refresh.
    await seedGlobal(pool);
    console.log("refreshed global data (demo registry, allowlist, taxonomy, cards); demo user kept (npm run db:reset re-seeds it)");
    return;
  }
  await seedAll(pool);
  console.log("seeded: Maya + 60 txns, demo store registry, allowlist, taxonomy, game cards (hand-written + message dataset), eval user");
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
