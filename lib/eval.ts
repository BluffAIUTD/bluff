import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

export const EVAL_RESULTS_PATH = () => process.env.EVAL_RESULTS_PATH || path.join(process.cwd(), "eval", "results.json");

const Prf = z.object({ p: z.number(), r: z.number(), f1: z.number() });
const Failure = z.object({ id: z.string(), text: z.string(), expected: z.string(), predicted: z.string(), note: z.string() });

export const ResultsSchema = z.object({
  generated_at: z.string(),
  claimA: z.object({
    n: z.number(), split: z.string(), dataset: z.string(), mode: z.string(),
    bluff: Prf, baseline: Prf.nullable(), baseline_name: z.string().optional(), unsure_as_legit: Prf.optional(),
    category_accuracy: z.number().nullable().optional(), caveat: z.string().optional(), failures: z.array(Failure),
  }).nullable().optional(),
  claimB: z.object({
    n: z.number(), split: z.string(), dataset: z.string(), method: z.string(),
    bluff: Prf, baseline: Prf, threshold: z.number().optional(), caveat: z.string().optional(), failures: z.array(Failure), baseline_failures: z.array(Failure).optional(),
  }).nullable().optional(),
  stretch: z.unknown().optional(),
});
export type EvalResults = z.infer<typeof ResultsSchema>;

/** Read the committed results file; null when absent or unreadable (the UI shows an honest empty state). */
export function readEvalResults(): EvalResults | null {
  try {
    const raw = JSON.parse(fs.readFileSync(EVAL_RESULTS_PATH(), "utf8"));
    const r = ResultsSchema.safeParse(raw);
    return r.success ? r.data : null;
  } catch { return null; }
}
