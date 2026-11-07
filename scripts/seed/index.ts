import { getPool, closePool } from "../../lib/db/pool";
import { migrate } from "../../lib/db/migrate";
import { seedAll } from "./seed";

(async () => {
  const pool = getPool();
  await migrate(pool);
  const has = (await pool.query("SELECT 1 FROM users WHERE id = '00000000-0000-4000-8000-000000000001'")).rowCount;
  if (has) { console.log("already seeded (use npm run db:reset to re-seed the demo user)"); return; }
  await seedAll(pool);
  console.log("seeded: Maya + 60 txns, 8 stores, allowlist, taxonomy (placeholder), 15 game cards, eval user");
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
