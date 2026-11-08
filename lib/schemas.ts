import { z } from "zod";

export const VERDICT_VALUES = ["likely_scam", "unsure", "looks_ok"] as const;
export const MODE_VALUES = ["live", "cached", "replayed", "basic"] as const;
export const FIELD_TYPES = ["card_number", "cvv", "ssn", "password", "phone", "dob", "address", "email", "name"] as const;

export type VerdictLabel = (typeof VERDICT_VALUES)[number];
export type RunModeValue = (typeof MODE_VALUES)[number];
export type FieldType = (typeof FIELD_TYPES)[number];

/** score < 40 likely scam, 40–69 unsure, >= 70 looks ok (product_spec P1-2). */
export function verdictLabel(score: number): VerdictLabel {
  if (score < 40) return "likely_scam";
  if (score < 70) return "unsure";
  return "looks_ok";
}

export const VERDICT_TEXT: Record<VerdictLabel, string> = {
  likely_scam: "Likely scam",
  unsure: "Unsure",
  looks_ok: "Looks OK",
};

export const LinkedSchema = z.object({
  exposure_id: z.string().optional(),
  txn_id: z.string().optional(),
  match_reasons: z.array(z.string()).optional(),
  kind: z.enum(["flagged", "expected", "possible"]).optional(),
});

export const AnalysisFindingSchema = z.object({
  title: z.string().min(1).max(90),
  detail: z.string().max(240).default(""),
  severity: z.enum(["high", "medium", "low", "good", "info"]).default("medium"),
  page: z.string().max(200).optional(),
});
export const AnalysisSchema = z.object({
  summary: z.string().min(1).max(900),
  findings: z.array(AnalysisFindingSchema).max(8).default([]),
  agrees_with_basic: z.boolean().optional(),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/** The single output of every agent run (engineering_spec §2.1). */
export const VerdictSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(VERDICT_VALUES),
  confidence: z.number().min(0).max(1),
  confidence_reason: z.string().min(1).max(120),
  category: z.string().min(1).max(64),
  evidence: z.array(z.string().min(1).max(90)).min(3).max(5),
  evidence_keys: z.array(z.string()).max(12),
  next_steps: z.array(z.string().min(1).max(70)).min(2).max(4),
  linked: LinkedSchema.default({}),
  mode: z.enum(MODE_VALUES),
  /** Deep site analysis (bank scan, Nemotron): a short narrative plus findings that cite the page they came from. */
  analysis: AnalysisSchema.optional(),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/** Arguments of the `submit_verdict` tool: a Verdict without server-owned fields. */
export const SubmitVerdictArgsSchema = VerdictSchema.omit({ mode: true, confidence: true, confidence_reason: true }).extend({
  confidence: z.number().min(0).max(1).optional(),
  confidence_reason: z.string().max(120).optional(),
});

// ---- SSE events (engineering_spec §4) -------------------------------------
export const StepEventSchema = z.object({
  seq: z.number().int().min(0),
  kind: z.enum(["plan", "tool", "final"]),
  tool: z.string().nullable().optional(),
  inputSummary: z.string(),
  outputSummary: z.string(),
  ms: z.number().int().min(0),
});
export type StepEvent = z.infer<typeof StepEventSchema>;

export type ErrorCode = "timeout" | "malformed" | "rate_limited" | "upstream_down" | "bad_input" | "not_found" | "forbidden" | "conflict";

export type RunStreamEvent =
  | { type: "step"; data: StepEvent }
  | { type: "verdict"; data: Verdict }
  | { type: "error"; data: { code: ErrorCode; message: string; fallbackVerdict?: Verdict } }
  | { type: "done"; data: { totalMs: number; mode: RunModeValue; verdictId?: string; runId?: string } };

// ---- API inputs -------------------------------------------------------------
export const PageInvestigateSchema = z.object({
  url: z.string().min(1).max(2048),
  host: z.string().min(1).max(255).optional(),
  fieldTypes: z.array(z.enum(FIELD_TYPES)).max(12).default([]),
  signals: z.record(z.string(), z.union([z.boolean(), z.number(), z.string()])).default({}),
  source: z.enum(["extension", "check"]).default("check"),
});
export type PageInvestigateInput = z.infer<typeof PageInvestigateSchema>;

export const MessageInvestigateSchema = z.object({
  text: z.string().max(2000, "too_long"),
  source: z.enum(["check", "sms", "eval"]).default("check"),
});
export type MessageInvestigateInput = z.infer<typeof MessageInvestigateSchema>;

export const ExposureCreateSchema = z.object({
  verdictId: z.string().min(1),
  url: z.string().min(1).max(2048),
  host: z.string().min(1).max(255),
  fieldTypes: z.array(z.enum(FIELD_TYPES)).max(12).default([]),
  action: z.enum(["continue", "watch"]),
});
export type ExposureCreateInput = z.infer<typeof ExposureCreateSchema>;

export const GameAnswerSchema = z.object({ cardId: z.string().min(1), guess: z.enum(["legit", "scam"]) });
export const GameFinishSchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  answers: z.array(z.object({ cardId: z.string(), guess: z.enum(["legit", "scam"]) })).max(5),
});
