import { SubmitVerdictArgsSchema, VerdictSchema, verdictLabel, type Verdict } from "../../schemas";
import { computeConfidence } from "../../rules/confidence";
import type { ToolDef } from "./types";

export type SubmitResult = { ok: true; verdict: Verdict } | { ok: false; errors: string[] };

/**
 * Validates submit_verdict arguments. Confidence is computed from evidence_keys (§6.4), not the model's self-report,
 * and forced to `unsure` when below 0.5. Verdict label is derived from the score.
 */
export function submitVerdict(args: unknown, mode: Verdict["mode"] = "live"): SubmitResult {
  const parsed = SubmitVerdictArgsSchema.safeParse(args);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "args"}: ${i.message}`) };
  const a = parsed.data;
  const c = computeConfidence(a.evidence_keys);
  let verdict = verdictLabel(a.score);
  let score = a.score;
  if (c.confidence < 0.5) { verdict = "unsure"; score = Math.min(69, Math.max(40, score)); }
  const out = VerdictSchema.safeParse({ ...a, score, verdict, confidence: c.confidence, confidence_reason: c.reason, mode });
  if (!out.success) return { ok: false, errors: out.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  return { ok: true, verdict: out.data };
}

export const submitVerdictTool: ToolDef = {
  name: "submit_verdict",
  description: "Finish the run by submitting the final verdict. score 0-100 (higher = safer). evidence 3-5 short strings (<=90 chars) tied to evidence_keys; next_steps 2-4 imperative strings (<=70 chars).",
  parameters: {
    type: "object",
    properties: {
      score: { type: "integer", minimum: 0, maximum: 100 },
      verdict: { type: "string", enum: ["likely_scam", "unsure", "looks_ok"] },
      category: { type: "string" },
      evidence: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
      evidence_keys: { type: "array", items: { type: "string" } },
      next_steps: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 4 },
      linked: { type: "object", properties: { exposure_id: { type: "string" }, txn_id: { type: "string" }, match_reasons: { type: "array", items: { type: "string" } } } },
    },
    required: ["score", "verdict", "category", "evidence", "evidence_keys", "next_steps"],
  },
  run: async (args) => submitVerdict(args),
};
