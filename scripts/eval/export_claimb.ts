// Writes eval/claimB_cases.json: deterministic ids + ground truth + split for the Claim B harness.
// The harness reads this file; the server never reveals ground truth through the API.
import fs from "node:fs";
import { EVAL_CHARGES, EVAL_EXPOSURES } from "../../data/evalLink";
import { detId } from "../../lib/db/ids";

const out = {
  note: "Synthetic charges authored for this project (not real customer data). 20 positives with a true exposure, 10 negatives with none; 10 dev / 20 test.",
  exposures: EVAL_EXPOSURES.map((e) => ({ id: detId("eval-exposure", e.key), label: e.label, legit: !!e.legit, days_ago: e.daysAgo })),
  charges: EVAL_CHARGES.map((c) => ({
    key: c.key, txn_id: detId("eval-txn", c.key), descriptor: c.descriptor, true_exposure_id: c.exposure ? detId("eval-exposure", c.exposure) : null,
    split: c.split, hard: !!c.hard, note: c.note ?? "",
  })),
};
fs.mkdirSync("eval", { recursive: true });
fs.writeFileSync("eval/claimB_cases.json", JSON.stringify(out, null, 2) + "\n");
console.log(`wrote eval/claimB_cases.json (${out.charges.length} charges)`);
