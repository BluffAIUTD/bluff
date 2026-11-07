import { descriptorTokens, labelTokens } from "./normalize";

export const LINK_THRESHOLD = 0.55;
export const MAX_DAYS = 45;
const DAY_MS = 86_400_000;

function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of s.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    const p = `  ${word} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

/** Mirrors pg_trgm similarity(): |A∩B| / |A∪B| over padded word trigrams. */
export function trigramSimilarity(a: string, b: string): number {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/**
 * Abbreviation score (0.85 or 0): the descriptor's letters form an ordered subsequence of the label's
 * letters, start with the label's first letter and hit the initial of every label token
 * (e.g. "fkshp" ⊂ "fastkicks-shop").
 */
export function abbreviationScore(descriptorNorm: string, label: string): number {
  const d = descriptorNorm.replace(/[^a-z]/g, "");
  const toks = labelTokens(label).map((t) => t.replace(/[^a-z]/g, "")).filter(Boolean);
  if (d.length < 3 || !toks.length) return 0;
  const total = toks.reduce((n, t) => n + t.length, 0);
  if (d.length > total) return 0;
  // Every label token must receive ≥1 descriptor char; its first char is the token initial,
  // the rest an ordered subsequence of the token's remaining letters.
  const subseq = (chars: string, from: string) => {
    let j = 0;
    for (const c of chars) { j = from.indexOf(c, j); if (j < 0) return false; j++; }
    return true;
  };
  const match = (di: number, ti: number): boolean => {
    if (ti === toks.length) return di === d.length;
    const t = toks[ti];
    if (d[di] !== t[0]) return false;
    for (let k = 1; di + k <= d.length && k <= t.length; k++) {
      if (subseq(d.slice(di + 1, di + k), t.slice(1)) && match(di + k, ti + 1)) return true;
    }
    return false;
  };
  return match(0, 0) ? 0.85 : 0;
}

/** Jaccard overlap of tokens ≥ 3 chars. */
export function tokenJaccard(descriptorNorm: string, label: string): number {
  const A = new Set(descriptorTokens(descriptorNorm).filter((t) => t.length >= 3));
  const B = new Set(labelTokens(label).filter((t) => t.length >= 3));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

export type NameScore = { score: number; method: "trigram" | "abbreviation" | "tokens" | "none"; parts: { trigram: number; abbreviation: number; tokens: number } };

export function nameScore(descriptorNorm: string, label: string): NameScore {
  const trigram = trigramSimilarity(descriptorNorm, label.replace(/-/g, " "));
  const abbreviation = abbreviationScore(descriptorNorm, label);
  const tokens = tokenJaccard(descriptorNorm, label);
  const score = Math.max(trigram, abbreviation, tokens);
  const method = score === 0 ? "none" : score === abbreviation ? "abbreviation" : score === trigram ? "trigram" : "tokens";
  return { score, method, parts: { trigram, abbreviation, tokens } };
}

/** 1.0 for 0–7 days, linear to 0.3 at 45 days; null when outside the window or before the exposure. */
export function timeScore(exposureAt: Date, txnAt: Date): number | null {
  const days = (txnAt.getTime() - exposureAt.getTime()) / DAY_MS;
  if (days < 0 || days > MAX_DAYS) return null;
  if (days <= 7) return 1;
  return 1 - (0.7 * (days - 7)) / (MAX_DAYS - 7);
}

export type LinkScore = { score: number; name: NameScore; time: number; days: number; reasons: string[] };

/** Link score = 0.7·name + 0.3·time (+0.1 if watched). Returns null when the exposure cannot explain the charge. */
export function linkScore(args: { descriptor: string; descriptorNorm: string; label: string; exposureAt: Date; txnAt: Date; watch?: boolean }): LinkScore | null {
  const time = timeScore(args.exposureAt, args.txnAt);
  if (time === null) return null;
  const name = nameScore(args.descriptorNorm, args.label);
  const score = Math.min(1, 0.7 * name.score + 0.3 * time + (args.watch ? 0.1 : 0));
  const days = Math.floor((args.txnAt.getTime() - args.exposureAt.getTime()) / DAY_MS);
  const reasons: string[] = [];
  const shown = args.descriptor.replace(/^\s*(SQ|SP|TST|PAYPAL|PP)\s*\*\s*/i, "").trim();
  if (name.score > 0) {
    const how = name.method === "abbreviation" ? "abbreviates" : name.method === "tokens" ? "shares words with" : "≈";
    reasons.push(`descriptor '${shown}' ${how} '${args.label}'`);
  }
  reasons.push(days === 0 ? "charged the same day as the exposure" : `charged ${days} day${days === 1 ? "" : "s"} after exposure`);
  if (args.watch) reasons.push("you chose to watch this site");
  return { score, name, time, days, reasons };
}
