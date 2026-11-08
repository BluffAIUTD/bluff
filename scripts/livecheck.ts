// Live agent check (polish_queue #7): N runs on the demo stores; counts live schema-valid verdicts and times them.
// Usage: AGENT_MODE=live NVIDIA_API_KEY=… NEMOTRON_MODEL=… npm run livecheck
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { STORES } from "../data/stores";
import { runToCompletion } from "../lib/agent/runs";

(async () => {
  const rows: { host: string; mode: string; verdict: string; score: number; ms: number; err?: string }[] = [];
  const hosts = [...STORES.map((s) => s.slug), "fastkicks-shop", "tollpay-tx"];
  for (const h of hosts) {
    const t0 = Date.now();
    const r = await runToCompletion({ kind: "page", userId: MAYA_ID, url: `https://${h}`, host: h, fieldTypes: ["card_number", "cvv"], signals: {}, source: "check" }, { fresh: true });
    rows.push({ host: h, mode: r.mode, verdict: r.verdict.verdict, score: r.verdict.score, ms: Date.now() - t0 });
    console.log(`${h.padEnd(18)} mode ${r.mode.padEnd(6)} ${r.verdict.verdict.padEnd(12)} score ${String(r.verdict.score).padStart(3)}  ${Date.now() - t0}ms`);
  }
  const live = rows.filter((r) => r.mode === "live");
  const ms = rows.map((r) => r.ms).sort((a, b) => a - b);
  const p = (q: number) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
  const correct = rows.filter((r) => (r.verdict === "likely_scam") === (STORES.find((s) => s.slug === r.host)?.scam ?? false)).length;
  console.log(`\nlive schema-valid: ${live.length}/${rows.length}  correct verdicts: ${correct}/${rows.length}  p50 ${p(0.5)}ms  p95 ${p(0.95)}ms`);
})().catch((e) => { console.error(e); process.exitCode = 1; }).finally(closePool);
