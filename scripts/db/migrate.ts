import { getPool, closePool } from "../../lib/db/pool";
import { migrate } from "../../lib/db/migrate";

migrate(getPool())
  .then((a) => console.log(a.length ? `applied: ${a.join(", ")}` : "up to date"))
  .catch((e) => { console.error(e.message); process.exitCode = 1; })
  .finally(closePool);
