/** Pure metric helpers for Claim A (scripts/eval/claim_a.ts). Positive class = scam; `unsure` counts as scam unless noted. */
export type Label = "scam" | "legit";
export type Row = { id: string; text: string; label: Label; category: string; difficulty?: string };
export type VerdictLabel = "likely_scam" | "unsure" | "looks_ok";
/** One method's answer for one message. `scam` is set for methods without a verdict (the link baseline). */
export type Pred = { verdict?: VerdictLabel; scam?: boolean; confidence?: number; score?: number; category?: string; mode?: string; ms?: number; evidence?: string[]; error?: string };
export type Prf = { p: number; r: number; f1: number };

const r4 = (n: number) => Math.round(n * 10000) / 10000;

export function prf(tp: number, fp: number, fn: number): Prf {
  const p = tp + fp ? tp / (tp + fp) : 0, r = tp + fn ? tp / (tp + fn) : 0;
  return { p: r4(p), r: r4(r), f1: r4(p + r ? (2 * p * r) / (p + r) : 0) };
}

/** Predicted "scam?" for a method's answer; an errored answer (no verdict) is counted wrong by the caller. */
export function predictedScam(x: Pred | undefined, unsureAsScam = true): boolean | null {
  if (!x) return null;
  if (typeof x.scam === "boolean") return x.scam;
  if (!x.verdict) return null;
  return x.verdict === "likely_scam" || (x.verdict === "unsure" && unsureAsScam);
}

export type Binary = Prf & { n: number; tp: number; fp: number; fn: number; tn: number; accuracy: number; unsure: number; errors: number };

export function binary(rows: Row[], preds: Record<string, Pred>, unsureAsScam = true): Binary {
  let tp = 0, fp = 0, fn = 0, tn = 0, unsure = 0, errors = 0;
  for (const row of rows) {
    const truth = row.label === "scam";
    const x = preds[row.id];
    if (x?.verdict === "unsure") unsure++;
    let p = predictedScam(x, unsureAsScam);
    if (p === null) { errors++; p = !truth; } // an error is a wrong answer
    if (p && truth) tp++; else if (p) fp++; else if (truth) fn++; else tn++;
  }
  return { n: rows.length, tp, fp, fn, tn, ...prf(tp, fp, fn), accuracy: r4(rows.length ? (tp + tn) / rows.length : 0), unsure, errors };
}

/** Of the scam messages a method flagged likely_scam, the share whose category matches the dataset's category. */
export function categoryAccuracy(rows: Row[], preds: Record<string, Pred>): { n: number; correct: number; accuracy: number | null } {
  let n = 0, correct = 0;
  for (const row of rows) {
    const x = preds[row.id];
    if (row.label !== "scam" || x?.verdict !== "likely_scam" || !x.category) continue;
    n++;
    if (x.category === row.category) correct++;
  }
  return { n, correct, accuracy: n ? r4(correct / n) : null };
}

export const CALIBRATION_EDGES = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0001];
export type Bucket = { range: string; n: number; stated: number | null; observed: number | null };
export type Calibration = { n: number; ece: number; buckets: Bucket[] };

/**
 * Reliability of stated confidence for committed verdicts (likely_scam / looks_ok; unsure verdicts claim nothing):
 * per bucket, mean stated confidence vs. the share that was right. ECE = Σ (n_b / N) · |stated_b − observed_b|.
 */
export function calibration(rows: Row[], preds: Record<string, Pred>, edges = CALIBRATION_EDGES): Calibration {
  const b = edges.slice(0, -1).map(() => ({ n: 0, conf: 0, ok: 0 }));
  let N = 0;
  for (const row of rows) {
    const x = preds[row.id];
    if (!x?.verdict || x.verdict === "unsure" || typeof x.confidence !== "number") continue;
    const i = edges.findIndex((e, j) => j < edges.length - 1 && x.confidence! >= e && x.confidence! < edges[j + 1]);
    if (i < 0) continue;
    N++;
    b[i].n++; b[i].conf += x.confidence;
    if ((x.verdict === "likely_scam") === (row.label === "scam")) b[i].ok++;
  }
  const ece = b.reduce((s, x) => s + (x.n ? (x.n / N) * Math.abs(x.conf / x.n - x.ok / x.n) : 0), 0);
  const fmt = (e: number) => (e >= 1 ? "1.00" : e.toFixed(2));
  return {
    n: N, ece: r4(ece),
    buckets: b.map((x, i) => ({ range: `${fmt(edges[i])}–${fmt(Math.min(1, edges[i + 1]))}`, n: x.n, stated: x.n ? r4(x.conf / x.n) : null, observed: x.n ? r4(x.ok / x.n) : null })),
  };
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}

/** Deterministic PRNG (mulberry32) so samples are reproducible from a seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Up to `perCategory` ids from each category, chosen with a seeded shuffle; order of the result is by id. */
export function stratifiedSample(rows: Row[], perCategory: number, seed = 42): string[] {
  const next = rng(seed);
  const out: string[] = [];
  for (const cat of [...new Set(rows.map((r) => r.category))].sort()) {
    const ids = rows.filter((r) => r.category === cat).map((r) => r.id).sort();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
    out.push(...ids.slice(0, perCategory));
  }
  return out.sort();
}

/** The stand-in baseline (same rule as scripts/eval/baseline.py): "the message contains a link" means scam. */
const LINK = /https?:\/\/|\b[a-z0-9-]+\.(?:com|net|org|co|top|xyz|help|click|live|info)\b/i;
export const linkBaseline = (text: string) => LINK.test(text);

export type PerCategory = { category: string; label: Label; n: number; correct: Record<string, number> };

/** Messages each method got right (scam vs legit), per dataset category. */
export function perCategory(rows: Row[], methods: Record<string, Record<string, Pred>>): PerCategory[] {
  const cats = [...new Set(rows.map((r) => r.category))].sort();
  return cats.map((category) => {
    const inCat = rows.filter((r) => r.category === category);
    const correct: Record<string, number> = {};
    for (const [m, preds] of Object.entries(methods)) {
      correct[m] = inCat.filter((r) => preds[r.id] && predictedScam(preds[r.id]) === (r.label === "scam")).length;
    }
    return { category, label: inCat[0].label, n: inCat.length, correct };
  });
}

export type Failure = { id: string; text: string; expected: string; predicted: string; note: string };

/** Wrong answers (and errors), most confident mistakes first. */
export function failures(rows: Row[], preds: Record<string, Pred>, method: string, limit = 8): Failure[] {
  const out: [number, Failure][] = [];
  for (const row of rows) {
    const x = preds[row.id];
    const p = predictedScam(x);
    const truth = row.label === "scam";
    if (p === truth) continue;
    const v = x?.verdict ? `${x.verdict} (${x.score}/100, ${Math.round((x.confidence ?? 0) * 100)}% sure)` : "no verdict";
    const note = x?.error && !x.verdict ? `${method}: error: ${x.error}` : `${method}: ${v}, category ${x?.category ?? "?"}${x?.evidence?.length ? `; evidence: ${x.evidence.slice(0, 2).join("; ")}` : ""}`;
    out.push([x?.confidence ?? 0, { id: row.id, text: row.text.replace(/\s+/g, " ").slice(0, 220), expected: `${row.label} (${row.category})`, predicted: p === null ? "error" : p ? "scam" : "legit", note: note.slice(0, 300) }]);
  }
  return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, f]) => f);
}
