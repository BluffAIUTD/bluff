// Pre-warm before judging (engineering_spec §8): runs all 8 demo hosts and the signature charge once so verdict-cache and
// replay rows exist, wakes the model endpoint, then resets the demo user to a clean state. Usage: npm run prewarm
import { getPool, closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { STORES, SCRIPTS } from "../data/stores";
import { runToCompletion } from "../lib/agent/runs";
import { postScriptedCharge } from "../lib/demo";
import { resetDemo } from "./seed/seed";

(async () => {
  const db = getPool();
  const t0 = Date.now();
  for (const s of STORES) {
    const r = await runToCompletion({ kind: "page", userId: MAYA_ID, url: `https://${s.slug}`, host: s.slug, fieldTypes: ["card_number", "cvv"], signals: {}, source: "check" }, { fresh: true });
    console.log(`page ${s.slug.padEnd(18)} ${r.verdict.verdict.padEnd(12)} score ${String(r.verdict.score).padStart(3)}  mode ${r.mode}`);
  }
  // The signature charge needs an exposure to link to; create one, post the charge, run it live, then reset.
  const v = await runToCompletion({ kind: "page", userId: MAYA_ID, url: "https://fastkicks-shop", host: "fastkicks-shop", fieldTypes: ["card_number"], signals: {}, source: "check" });
  await db.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,verdict_id,user_action,field_types) VALUES ($1,'https://fastkicks-shop','fastkicks-shop','fastkicks-shop',$2,'likely_scam',$3,'watch','{card_number,cvv}')", [MAYA_ID, v.verdict.score, v.verdictId]);
  const script = SCRIPTS.find((s) => s.id === "txn_demo_link_1")!;
  const posted = await postScriptedCharge(db, MAYA_ID, script);
  const t = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: posted.id }, { fresh: true });
  console.log(`txn  ${script.id.padEnd(18)} ${t.verdict.verdict.padEnd(12)} mode ${t.mode}${t.mode === "live" ? " (replay trace saved)" : " (not live: no replay trace saved)"}`);
  await resetDemo(db);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s; demo user reset`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
