import type { Verdict } from "../../../lib/schemas";
import { verdictLabel } from "../../../lib/schemas";
import { computeConfidence } from "./confidence";
import { KEYS } from "./weights";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Score from the same weights as confidence (higher = safer). Tuned so strong scam signals land < 40 and clean legit sites ≥ 70. */
export function scoreFromKeys(keys: string[]): number {
  const { scamWeight: S, legitWeight: L } = computeConfidence(keys);
  if (S === 0 && L === 0) return 50;
  const R = S / (S + 0.8);
  const legit = Math.min(1, L / 0.5);
  return clamp(Math.round(50 + 45 * legit - 70 * R), 2, 95);
}

/** Next steps for a rules-only verdict on a page or message (before the user pays). */
export const BASIC_NEXT_STEPS = {
  likely_scam: ["Don't enter any payment details", "Leave this site or message", "Check the company on its official app", "Report it to your carrier or bank"],
  unsure: ["Don't click links or share details yet", "Check the sender on its official app", "Search the company name plus \"scam\"", "Pay with a card you can dispute"],
  looks_ok: ["Use a card, not a debit or gift card", "Keep your receipt and order number", "Watch your statement for surprises"],
} as const;

const GENERIC_EVIDENCE = [
  "Limited check: the page content was not analyzed",
  "Based on rules only, without the AI agent",
  "No contact details or policies could be verified",
];

export type BasicCheckInput = {
  keys: string[];
  /** category to use when the verdict is scam-ish */
  scamCategory?: string;
  legitCategory?: string;
  extraEvidence?: string[];
  nextSteps?: string[];
};

/** Deterministic "basic check" verdict (engineering_spec §6.6). Always labeled mode="basic". */
export function basicCheck(input: BasicCheckInput): Verdict {
  const keys = [...new Set(input.keys)].filter((k) => KEYS[k]);
  const c = computeConfidence(keys);
  let score = scoreFromKeys(keys);
  let verdict = verdictLabel(score);
  if (c.confidence < 0.5) { verdict = "unsure"; score = clamp(score, 40, 69); }

  // Most influential evidence first, scam signals first for scammy verdicts.
  const ordered = [...keys].sort((a, b) => {
    const pref = verdict === "looks_ok" ? "legit" : "scam";
    const pa = KEYS[a].dir === pref ? 1 : 0, pb = KEYS[b].dir === pref ? 1 : 0;
    return pb - pa || KEYS[b].w - KEYS[a].w;
  });
  const evidence = [...(input.extraEvidence ?? []), ...ordered.map((k) => KEYS[k].evidence)].map((e) => e.slice(0, 90));
  for (const g of GENERIC_EVIDENCE) { if (evidence.length >= 3) break; evidence.push(g); }
  const category = verdict === "looks_ok" ? input.legitCategory ?? "legit_store" : verdict === "likely_scam" ? input.scamCategory ?? "fake_store" : "unclear";

  return {
    score, verdict, confidence: c.confidence, confidence_reason: c.reason, category,
    evidence: evidence.slice(0, 5), evidence_keys: ordered.slice(0, 12),
    next_steps: (input.nextSteps ?? BASIC_NEXT_STEPS[verdict]).slice(0, 4).map((s) => s.slice(0, 70)), linked: {}, mode: "basic",
  };
}
