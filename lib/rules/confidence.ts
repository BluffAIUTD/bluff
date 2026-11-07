import { KEYS } from "./weights";

export type ConfidenceResult = { confidence: number; reason: string; scamWeight: number; legitWeight: number; coverage: number };

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * engineering_spec §6.4: confidence from signal agreement, not model self-report.
 * agreement = |Σscam − Σlegit| / Σ|weights|; coverage = min(1, signals_present / 4);
 * confidence = clamp(0.35 + 0.45·agreement + 0.2·coverage, 0, 0.97).
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
  const coverage = Math.min(1, present.length / 4);
  const confidence = Number(clamp(0.35 + 0.45 * agreement + 0.2 * coverage, 0, 0.97).toFixed(2));
  return { confidence, reason: confidenceReason(present, S, L, coverage), scamWeight: S, legitWeight: L, coverage };
}

function strongest(keys: string[], dir: "scam" | "legit") {
  return keys.filter((k) => KEYS[k].dir === dir).sort((a, b) => KEYS[b].w - KEYS[a].w)[0];
}

function confidenceReason(present: string[], S: number, L: number, coverage: number): string {
  if (!present.length) return "No usable signals, so this is only a guess";
  if (S > 0 && L > 0) {
    const s = strongest(present, "scam"), l = strongest(present, "legit");
    return `Mixed signals: ${KEYS[l].evidence.toLowerCase()}, but ${KEYS[s].evidence.toLowerCase()}`.slice(0, 120);
  }
  if (coverage < 1) return `Based on ${present.length} signal${present.length === 1 ? "" : "s"}; more would raise confidence`;
  return `${present.length} independent signals point the same way`;
}
