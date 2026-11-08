/**
 * Claim A (message detection) on the held-out TEST split of Bluff's own synthetic message set
 * (data/messages/bluff-messages.jsonl, split eval/messages_split.json: seed 42, 70/30 stratified by category, committed
 * before any tuning). Rules were tuned on the train split only; every reported metric is on the test split, except the
 * train-fit line (rules on their own tuning data), which is reported to show the train/test gap.
 *
 *   npx tsx scripts/eval/claim_a.ts                      # link baseline + rules-only before (main@142116b) and after → eval/results.json
 *   DATABASE_URL=postgres://…/bluff_eval_acc npx tsx --env-file=.env scripts/eval/claim_a.ts --live [--per-category 2] [--budget-min 25] [--resume]
 *                                                        # also the LIVE Nemotron agent (paced; raw answers in eval/live_a.json)
 *   npx tsx scripts/eval/claim_a.ts --reuse-live         # re-score with the committed eval/live_a.json, no model calls
 *
 * The live run calls lib/agent/live.ts in-process, exactly as /check does (tools: taxonomy_match, domain_intel,
 * submit_verdict; rules fallback on timeout / rate limit). It needs a database with the taxonomy (npm run db:migrate,
 * db:seed and embed-taxonomy against DATABASE_URL); it writes nothing to agent_runs.
 */
import fs from "node:fs";
import path from "node:path";
import { messageBasicCheck } from "../../lib/rules/message";
import { extractUrls } from "../../lib/rules/signals";
import { CONFIDENCE_MODEL } from "../../lib/rules/confidence";
import * as v0 from "./rules_v0";
import {
  binary, calibration, categoryAccuracy, failures, linkBaseline, percentile, perCategory, stratifiedSample,
  type Pred, type Row,
} from "./claim_a_lib";

const ROOT = path.join(__dirname, "..", "..");
const DATA = path.join(ROOT, "data", "messages", "bluff-messages.jsonl");
const SPLIT = path.join(ROOT, "eval", "messages_split.json");
const RESULTS = process.env.EVAL_RESULTS_PATH || path.join(ROOT, "eval", "results.json");
const LIVE_FILE = path.join(ROOT, "eval", "live_a.json");

const args = process.argv.slice(2);
const flag = (f: string) => args.includes(f);
const opt = (f: string, d: number) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : d; };

type LiveFile = { generated_at: string; model: string; per_category: number | null; budget_min: number; order: string[]; results: Record<string, Pred & { tools?: string[] }> };

function loadRows(part: "test" | "train" = "test"): Row[] {
  const split = JSON.parse(fs.readFileSync(SPLIT, "utf8")) as { test: string[]; train: string[] };
  const test = new Set(split[part]);
  return fs.readFileSync(DATA, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l))
    .filter((r) => test.has(r.id)).map((r) => ({ id: r.id, text: r.text, label: r.label, category: r.category, difficulty: r.difficulty }));
}

const fromVerdict = (v: { verdict: Pred["verdict"]; confidence: number; score: number; category: string; mode: string; evidence: string[] }): Pred =>
  ({ verdict: v.verdict, confidence: v.confidence, score: v.score, category: v.category, mode: v.mode, evidence: v.evidence });

/** Round-robin over categories so a run cut short by the time budget is still close to stratified. */
function interleave(rows: Row[], ids: string[]): string[] {
  const byCat = new Map<string, string[]>();
  for (const id of ids) { const c = rows.find((r) => r.id === id)!.category; byCat.set(c, [...(byCat.get(c) ?? []), id]); }
  const queues = [...byCat.keys()].sort().map((c) => byCat.get(c)!);
  const out: string[] = [];
  while (queues.some((q) => q.length)) for (const q of queues) if (q.length) out.push(q.shift()!);
  return out;
}

async function runLive(rows: Row[]): Promise<LiveFile> {
  const { liveRun } = await import("../../lib/agent/live");
  const { EVAL_USER_ID, getConfig } = await import("../../lib/config");
  const { closePool } = await import("../../lib/db");
  const perCat = args.includes("--per-category") ? opt("--per-category", 2) : null;
  const budgetMs = opt("--budget-min", 25) * 60_000;
  const ids = perCat ? stratifiedSample(rows, perCat, 42) : rows.map((r) => r.id);
  const prev: LiveFile | null = flag("--resume") && fs.existsSync(LIVE_FILE) ? JSON.parse(fs.readFileSync(LIVE_FILE, "utf8")) : null;
  const out: LiveFile = { generated_at: new Date().toISOString(), model: getConfig().nvidia.model, per_category: perCat, budget_min: budgetMs / 60_000, order: interleave(rows, ids), results: prev?.results ?? {} };
  const t0 = Date.now();
  for (const id of out.order) {
    if (out.results[id]) continue;
    if (Date.now() - t0 > budgetMs) { console.log(`time budget reached after ${Object.keys(out.results).length} messages`); break; }
    const row = rows.find((r) => r.id === id)!;
    const tools: string[] = [];
    const ts = Date.now();
    const r = await liveRun({ kind: "message", userId: EVAL_USER_ID, text: row.text, source: "eval" }, (e) => { if (e.type === "step" && e.data.kind === "tool" && e.data.tool) tools.push(e.data.tool); });
    out.results[id] = { ...fromVerdict(r.verdict), mode: r.mode, ms: Date.now() - ts, tools, ...(r.error ? { error: `${r.error.code}: ${r.error.message}`.slice(0, 120) } : {}) };
    fs.writeFileSync(LIVE_FILE, JSON.stringify(out, null, 1) + "\n");
    const v = out.results[id];
    console.log(`${id} ${row.label.padEnd(5)} → ${v.verdict} ${v.score} ${Math.round((v.confidence ?? 0) * 100)}% ${v.mode} ${v.ms}ms [${tools.join(",")}]`);
  }
  await closePool();
  return out;
}

const SPLIT_TEXT = (n: number) => `held-out TEST split (n=${n}) of a seed-42, 70/30 split stratified by category (eval/messages_split.json, committed before any tuning); rules were tuned on the 215 train messages only`;

async function main() {
  const rows = loadRows();
  const methods: Record<string, Record<string, Pred>> = { baseline: {}, rules_v0: {}, rules: {} };
  for (const r of rows) {
    methods.baseline[r.id] = { scam: linkBaseline(r.text) };
    methods.rules_v0[r.id] = fromVerdict(v0.basicCheck({ keys: v0.messageKeys(r.text) }));
    methods.rules[r.id] = fromVerdict(messageBasicCheck(r.text));
  }
  let live: LiveFile | null = null;
  if (flag("--live")) live = await runLive(rows);
  else if (flag("--reuse-live") && fs.existsSync(LIVE_FILE)) live = JSON.parse(fs.readFileSync(LIVE_FILE, "utf8"));
  if (live) methods.live = live.results;

  const liveRows = live ? rows.filter((r) => live!.results[r.id]) : [];
  const fullLive = live != null && liveRows.length === rows.length;
  const noLink = rows.filter((r) => !linkBaseline(r.text) && extractUrls(r.text).length === 0);

  const describe = (id: string, name: string, mode: string, subset: Row[], note?: string) => {
    const preds = methods[id];
    const withVerdict = id !== "baseline";
    return {
      id, name, mode, n: subset.length, prf: binary(subset, preds), accuracy: binary(subset, preds).accuracy,
      ...(withVerdict ? { unsure_as_legit: binary(subset, preds, false), unsure: binary(subset, preds).unsure, category_accuracy: categoryAccuracy(subset, preds).accuracy, calibration: calibration(subset, preds) } : {}),
      ...(note ? { note } : {}),
    };
  };

  const table = [
    describe("baseline", "Stand-in baseline: contains a link → scam (not T-Mobile's baseline)", "rule", rows),
    describe("rules_v0", "Bluff rules-only, before (main@142116b)", "basic", rows, "Old message rules and confidence formula, frozen in scripts/eval/rules_v0"),
    describe("rules", "Bluff rules-only, after", "basic", rows, "The basic check: what Bluff answers when Nemotron is unavailable"),
  ];
  let liveStats = null;
  if (live && liveRows.length) {
    const lr = live.results;
    const fromModel = liveRows.filter((r) => lr[r.id].mode === "live").length;
    const ms = liveRows.map((r) => lr[r.id].ms ?? 0);
    const toolRuns = liveRows.filter((r) => (lr[r.id].tools ?? []).length > 0).length;
    table.push(describe("live", fullLive ? "Bluff live agent (Nemotron, rules fallback)" : `Bluff live agent (Nemotron, rules fallback), sample`, "live", liveRows,
      `${fromModel}/${liveRows.length} verdicts came from Nemotron; ${liveRows.length - fromModel} fell back to the rules (timeout, rate limit or invalid answer)`));
    if (!fullLive) table.push({ ...describe("rules", "Bluff rules-only, after (same sample)", "basic", liveRows), id: "rules_sample" });
    liveStats = {
      model: live.model, generated_at: live.generated_at, n: liveRows.length, full_test_split: fullLive,
      sample: fullLive ? "every test message" : `stratified sample: ${live.per_category ?? "?"} per category (seed 42)${liveRows.length < (live.order?.length ?? 0) ? `, cut to ${liveRows.length} by the ${live.budget_min}-minute time budget` : ""}`,
      from_model: fromModel, fell_back: liveRows.length - fromModel,
      used_tools: toolRuns, tool_calls: liveRows.reduce((s, r) => s + (lr[r.id].tools ?? []).length, 0),
      latency_ms: { p50: percentile(ms, 50), p95: percentile(ms, 95), max: Math.max(...ms) },
      pacing: `calls paced ${process.env.NVIDIA_MIN_GAP_MS ?? 1600} ms apart (trial-key rate limit), so latency includes queueing`,
    };
  }

  // Train fit: the tuned rules on the data they were tuned on (expected to be near perfect; the test gap is the point).
  const train = loadRows("train");
  const trainPreds = { rules_v0: {} as Record<string, Pred>, rules: {} as Record<string, Pred> };
  for (const r of train) { trainPreds.rules_v0[r.id] = fromVerdict(v0.basicCheck({ keys: v0.messageKeys(r.text) })); trainPreds.rules[r.id] = fromVerdict(messageBasicCheck(r.text)); }
  const trainFit = { n: train.length, rules_v0: binary(train, trainPreds.rules_v0), rules: binary(train, trainPreds.rules), rules_ece: calibration(train, trainPreds.rules).ece };

  const headline = table.find((m) => m.id === (fullLive ? "live" : "rules"))!;
  const baseline = table[0];
  const value = {
    n: rows.length,
    split: SPLIT_TEXT(rows.length),
    dataset: "Bluff's own synthetic message set (bluff-synthetic-v1: 306 SMS/email messages generated with NVIDIA Nemotron, model-audited and hand-reviewed). NOT T-Mobile data; none was provided.",
    mode: headline.id === "live" ? "live Nemotron agent with rules fallback (as deployed)" : "basic (rules-only); see the table for the live agent",
    bluff: headline.prf, unsure_as_legit: headline.unsure_as_legit, baseline: baseline.prf, baseline_name: baseline.name,
    category_accuracy: headline.category_accuracy ?? null,
    caveat: [
      "Synthetic data written by one model: phrasing is more uniform than real traffic, so these numbers are optimistic for real messages.",
      "The generator required scam links to use scam-prone domains and legit links to use .example, which makes link signals unusually strong here; the no-link subset below shows results without that help.",
      `Rules were written by looking at the train split (n=${train.length}), not the test split; on train the tuned rules score F1 ${trainFit.rules.f1.toFixed(2)} (before: ${trainFit.rules_v0.f1.toFixed(2)}), so the drop to the test numbers is the overfitting you should expect on new messages. Small n: each test category has 3 (scam) or 5 (legit) messages, so per-category numbers are anecdotes.`,
      live && !fullLive ? "The live agent was run on a sample of the test split, not all of it." : "",
    ].filter(Boolean).join(" "),
    headline: headline.id,
    train_fit: trainFit,
    methods: table,
    per_category: perCategory(rows, Object.fromEntries(Object.entries(methods).filter(([k]) => k !== "live" || fullLive))),
    no_link_subset: { n: noLink.length, scam: noLink.filter((r) => r.label === "scam").length, methods: Object.fromEntries(table.filter((m) => m.id !== "rules_sample").map((m) => [m.id, binary(m.id === "live" ? noLink.filter((r) => live!.results[r.id]) : noLink, methods[m.id])])) },
    confidence_model: { ...CONFIDENCE_MODEL, formula: "floor + (cap − floor) · (1 − e^(−net/tau)), net = |S − L| · √(|S − L| / (S + L)), S/L = summed scam/legit evidence weights", fitted_on: "train split", note: "Unsure verdicts claim nothing and are left out of the calibration buckets." },
    live: liveStats,
    failures: failures(headline.id === "live" ? liveRows : rows, methods[headline.id], headline.name),
    other_failures: headline.id === "live" ? failures(rows, methods.rules, "rules-only, after") : (live ? failures(liveRows, methods.live, "live agent") : []),
  };

  const data = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, "utf8")) : {};
  data.claimA = value;
  data.generated_at = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  fs.writeFileSync(RESULTS, JSON.stringify(data, null, 2) + "\n");
  for (const m of table) console.log(`${m.name.padEnd(62)} n=${m.n} P=${m.prf.p} R=${m.prf.r} F1=${m.prf.f1} acc=${m.accuracy}${"calibration" in m && m.calibration ? ` ECE=${m.calibration.ece}` : ""}${"category_accuracy" in m ? ` cat=${m.category_accuracy}` : ""}`);
  if (liveStats) console.log(JSON.stringify(liveStats));
  console.log(`wrote ${RESULTS}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
