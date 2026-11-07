import { LINK_THRESHOLD, linkScore } from "./score";

/** For each exposure, how many transactions have it as their best (≥ threshold) match. Pure; used by /exposure. */
export function linkedCounts(
  exposures: { id: string; label: string; created_at: Date; watch: boolean }[],
  txns: { ts: Date; descriptor: string; descriptor_norm: string }[],
): Map<string, number> {
  const counts = new Map<string, number>(exposures.map((e) => [e.id, 0]));
  for (const t of txns) {
    let best: { id: string; s: number } | null = null;
    for (const e of exposures) {
      const r = linkScore({ descriptor: t.descriptor, descriptorNorm: t.descriptor_norm, label: e.label, exposureAt: e.created_at, txnAt: t.ts, watch: e.watch });
      if (r && r.name.score >= 0.25 && r.score >= LINK_THRESHOLD && (!best || r.score > best.s)) best = { id: e.id, s: r.score };
    }
    if (best) counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
  }
  return counts;
}
