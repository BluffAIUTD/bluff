import type { Db } from "../db";
import { many, one } from "../db";
import { normalizeDescriptor } from "./normalize";
import { LINK_THRESHOLD, MAX_DAYS, linkScore } from "./score";

export type LinkCandidate = {
  exposureId: string; host: string; label: string; exposureAt: string; exposureScore: number; exposureVerdict: string;
  fieldTypes: string[]; watch: boolean;
  matchScore: number; nameScore: number; timeScore: number; days: number; reasons: string[];
  /** flagged: exposure was risky; expected: exposure was on a site rated OK (green "Expected charge"); */
  kind: "flagged" | "expected";
};

export type LinkResult = {
  /** Best candidate at or above the threshold, else null. */
  best: LinkCandidate | null;
  /** Top candidates (any score above 0.3), best first. */
  candidates: LinkCandidate[];
  /** Other candidates ≥ threshold besides `best` ("1 other possible match"). */
  otherCount: number;
  ms: number;
};

type ExposureRow = {
  id: string; host: string; label: string; created_at: Date; score: number; verdict: string; field_types: string[]; watch: boolean;
};

export type TxnLike = { ts: Date; descriptor: string; descriptorNorm?: string };

/**
 * Signature algorithm (engineering_spec §6.2): SQL narrows exposures to the 0–45 day window before the charge,
 * then name (trigram / abbreviation / token) and time scores are combined. Charges before the exposure never link.
 */
export async function findCandidates(db: Db, userId: string, txn: TxnLike, minScore = 0.3): Promise<LinkResult> {
  const t0 = performance.now();
  const norm = txn.descriptorNorm ?? normalizeDescriptor(txn.descriptor);
  const rows = await many<ExposureRow>(
    db,
    `SELECT id, host, label, created_at, score, verdict, field_types, watch
       FROM exposures
      WHERE user_id = $1 AND created_at <= $2 AND $2 - created_at <= ($3 || ' days')::interval
      ORDER BY created_at DESC`,
    [userId, txn.ts, String(MAX_DAYS)],
  );
  const scored: LinkCandidate[] = [];
  for (const e of rows) {
    const s = linkScore({ descriptor: txn.descriptor, descriptorNorm: norm, label: e.label, exposureAt: e.created_at, txnAt: txn.ts, watch: e.watch });
    if (!s || s.score < minScore) continue;
    scored.push({
      exposureId: e.id, host: e.host, label: e.label, exposureAt: e.created_at.toISOString(), exposureScore: e.score, exposureVerdict: e.verdict,
      fieldTypes: e.field_types, watch: e.watch, matchScore: Number(s.score.toFixed(3)), nameScore: Number(s.name.score.toFixed(3)),
      timeScore: Number(s.time.toFixed(3)), days: s.days, reasons: s.reasons, kind: e.score >= 70 ? "expected" : "flagged",
    });
  }
  scored.sort((a, b) => b.matchScore - a.matchScore);
  const above = scored.filter((c) => c.matchScore >= LINK_THRESHOLD);
  return { best: above[0] ?? null, candidates: scored.slice(0, 3), otherCount: Math.max(0, above.length - 1), ms: performance.now() - t0 };
}

/** Link a stored transaction by id. Returns null if the transaction does not exist for that user. */
export async function linkTransaction(db: Db, userId: string, txnId: string): Promise<LinkResult | null> {
  const t = await one<{ ts: Date; descriptor: string; descriptor_norm: string }>(
    db, "SELECT ts, descriptor, descriptor_norm FROM transactions WHERE id = $1 AND user_id = $2", [txnId, userId],
  );
  if (!t) return null;
  return findCandidates(db, userId, { ts: t.ts, descriptor: t.descriptor, descriptorNorm: t.descriptor_norm });
}
