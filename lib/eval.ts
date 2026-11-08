import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const EVAL_RESULTS_PATH = () => process.env.EVAL_RESULTS_PATH || path.join(process.cwd(), "eval", "results.json");

const Prf = z.object({ p: z.number(), r: z.number(), f1: z.number() });
const Failure = z.object({ id: z.string(), text: z.string(), expected: z.string(), predicted: z.string(), note: z.string() });

const Bucket = z.object({ range: z.string(), n: z.number(), stated: z.number().nullable(), observed: z.number().nullable() });
const Calibration = z.object({ n: z.number(), ece: z.number(), buckets: z.array(Bucket) });
const PrfAcc = Prf.extend({ accuracy: z.number().optional() });

/** One evaluated method on the Claim A test split (scripts/eval/claim_a.ts). */
const Method = z.object({
  id: z.string(), name: z.string(), mode: z.string(), n: z.number(), prf: PrfAcc, accuracy: z.number(),
  unsure: z.number().optional(), category_accuracy: z.number().nullable().optional(), calibration: Calibration.optional(), note: z.string().optional(),
});

const LiveStats = z.object({
  model: z.string(), n: z.number(), full_test_split: z.boolean(), sample: z.string(), from_model: z.number(), fell_back: z.number(),
  latency_ms: z.object({ p50: z.number().nullable(), p95: z.number().nullable(), max: z.number().nullable() }), pacing: z.string().optional(),
});

export const ResultsSchema = z.object({
  generated_at: z.string(),
  claimA: z.object({
    n: z.number(), split: z.string(), dataset: z.string(), mode: z.string(),
    bluff: Prf, baseline: Prf.nullable(), baseline_name: z.string().optional(), unsure_as_legit: Prf.optional(),
    category_accuracy: z.number().nullable().optional(), caveat: z.string().optional(), failures: z.array(Failure),
    // Detailed results (optional so older files still render): every method, per category, calibration, live stats.
    methods: z.array(Method).optional(), headline: z.string().optional(),
    per_category: z.array(z.object({ category: z.string(), label: z.string(), n: z.number(), correct: z.record(z.string(), z.number()) })).optional(),
    no_link_subset: z.object({ n: z.number(), scam: z.number(), methods: z.record(z.string(), PrfAcc) }).optional(),
    confidence_model: z.object({ floor: z.number(), cap: z.number(), tau: z.number(), formula: z.string(), fitted_on: z.string(), note: z.string().optional() }).optional(),
    live: LiveStats.nullable().optional(),
    other_failures: z.array(Failure).optional(),
  }).nullable().optional(),
  claimB: z.object({
    n: z.number(), split: z.string(), dataset: z.string(), method: z.string(),
    bluff: Prf, baseline: Prf, threshold: z.number().optional(), caveat: z.string().optional(), failures: z.array(Failure), baseline_failures: z.array(Failure).optional(),
  }).nullable().optional(),
  stretch: z.unknown().optional(),
});
export type EvalResults = z.infer<typeof ResultsSchema>;
export type ClaimA = NonNullable<EvalResults["claimA"]>;
export type EvalMethod = z.infer<typeof Method>;

/** Read the committed results file; null when absent or unreadable (the UI shows an honest empty state). */
export function readEvalResults(): EvalResults | null {
  try {
    const raw = JSON.parse(fs.readFileSync(EVAL_RESULTS_PATH(), "utf8"));
    const r = ResultsSchema.safeParse(raw);
    return r.success ? r.data : null;
  } catch { return null; }
}
