import { getPool, closePool } from "../../lib/db/pool";
import { resetDemo, seedGlobal } from "./seed";

(async () => {
  const pool = getPool();
  await seedGlobal(pool);
  await resetDemo(pool);
  console.log("demo user reset");
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
