import { KEYS } from "./weights";

export type ConfidenceResult = { confidence: number; reason: string; scamWeight: number; legitWeight: number; coverage: number; net: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Confidence model, chosen on the TRAIN split of eval/messages_split.json (reliability buckets; numbers in eval/results.json):
 * floor = no usable evidence, cap = the most a rule-based verdict ever claims, tau = how fast evidence saturates. tau is the
 * smallest value that keeps one weak signal (weight 0.15, e.g. urgency alone) below 70%; on train the tuned rules were
 * right more often than this curve says, which is expected for rules tuned on that same split.
 */
export const CONFIDENCE_MODEL = { floor: 0.35, cap: 0.95, tau: 0.18 } as const;

/**
 * Confidence from signal agreement, never from a model's self-report (engineering_spec §6.4, recalibrated):
 * S, L = summed weights of scam and legit evidence; agreement = |S − L| / (S + L); net = |S − L| · √agreement
 * (strength of the winning side, discounted when the signals disagree);
 * confidence = floor + (cap − floor) · (1 − e^(−net / tau)).
 * One weak signal stays below 70%, several strong agreeing signals approach the 95% cap, conflicting signals stay low.
 */
export function computeConfidence(keys: string[]): ConfidenceResult {
  const present = [...new Set(keys)].filter((k) => KEYS[k]);
  let S = 0, L = 0;
  for (const k of present) {
    if (KEYS[k].dir === "scam") S += KEYS[k].w;
    else L += KEYS[k].w;
  }
  const total = S + L;
  const agreement = total === 0 ? 0 : Math.abs(S - L) / total;
  const net = Math.abs(S - L) * Math.sqrt(agreement);
  const { floor, cap, tau } = CONFIDENCE_MODEL;
  const confidence = Number(clamp(floor + (cap - floor) * (1 - Math.exp(-net / tau)), 0, cap).toFixed(2));
  const coverage = Math.min(1, present.length / 4);
  return { confidence, reason: confidenceReason(present, S, L, confidence), scamWeight: S, legitWeight: L, coverage, net };
}

function strongest(keys: string[], dir: "scam" | "legit") {
  return keys.filter((k) => KEYS[k].dir === dir).sort((a, b) => KEYS[b].w - KEYS[a].w)[0];
}

function confidenceReason(present: string[], S: number, L: number, confidence: number): string {
  if (!present.length) return "No usable signals, so this is only a guess";
  if (S > 0 && L > 0) {
    const s = strongest(present, "scam"), l = strongest(present, "legit");
    return `Mixed signals: ${KEYS[l].evidence.toLowerCase()}, but ${KEYS[s].evidence.toLowerCase()}`.slice(0, 120);
  }
  const n = present.length;
  if (confidence < 0.75) return `Based on ${n === 1 ? "one weak signal" : `${n} weak signals`}; treat this as a hint, not proof`;
  if (n === 1) return "Based on one clear signal; more evidence would raise confidence";
  return `${n} independent signals point the same way`;
}
