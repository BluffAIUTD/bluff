import type { Db } from "../db";
import { many } from "../db";
import { findCandidates } from "../linker";
import type { FlagKindDto, TransactionDto } from "../types";

type RuleRow = {
  id: string; ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number; mcc_category: string | null;
  is_recurring: boolean; scripted: boolean; script_id: string | null;
  source: string; merchant_name: string | null; website: string | null;
  price_drift: boolean; duplicate: boolean; new_subscription: boolean; card_test: boolean;
};

/**
 * Rule flags computed in SQL (engineering_spec §6.2):
 * price_drift: > 1.5x the prior-90-day average with ≥ 2 prior charges · duplicate: same merchant+amount within 10 min ·
 * new_subscription: trial-sized charge(s) then a real one, or a recurring charge with no history · card_test: ≤ $2 from a never-seen merchant.
 */
const RULES_SQL = `
SELECT t.id, t.ts, t.descriptor, t.descriptor_norm, t.amount_cents, t.mcc_category, t.is_recurring, t.scripted, t.script_id,
  t.source, t.merchant_name, t.website,
  (p.n90 >= 2 AND t.amount_cents > 1.5 * p.avg90) AS price_drift,
  EXISTS (SELECT 1 FROM transactions d WHERE d.user_id = t.user_id AND d.descriptor_norm = t.descriptor_norm
            AND d.amount_cents = t.amount_cents AND d.id <> t.id AND abs(extract(epoch FROM (d.ts - t.ts))) <= 600) AS duplicate,
  ((p.n_any >= 1 AND p.n_trial_3d = p.n_any AND t.amount_cents > 100) OR (t.is_recurring AND p.n_any = 0)) AS new_subscription,
  (t.amount_cents <= 200 AND p.n_any = 0) AS card_test
FROM transactions t
LEFT JOIN LATERAL (
  SELECT count(*) FILTER (WHERE p.ts >= t.ts - interval '90 days') AS n90,
         avg(p.amount_cents) FILTER (WHERE p.ts >= t.ts - interval '90 days') AS avg90,
         count(*) AS n_any,
         count(*) FILTER (WHERE p.amount_cents <= 100 AND p.ts >= t.ts - interval '3 days') AS n_trial_3d
    FROM transactions p
   WHERE p.user_id = t.user_id AND p.descriptor_norm = t.descriptor_norm AND p.ts < t.ts AND p.id <> t.id
) p ON true
WHERE t.user_id = $1 AND ($2::uuid IS NULL OR t.id = $2)
ORDER BY t.ts DESC
LIMIT $3`;

export type LinkSummary = { exposureId: string; kind: "flagged" | "expected"; matchScore: number; host: string } | null;

async function build(db: Db, userId: string, txnId: string | null, limit: number): Promise<(TransactionDto & { link: LinkSummary })[]> {
  const rows = await many<RuleRow>(db, RULES_SQL, [userId, txnId, limit]);
  const out: (TransactionDto & { link: LinkSummary })[] = [];
  for (const r of rows) {
    const flags: FlagKindDto[] = [];
    if (r.price_drift) flags.push("price_drift");
    if (r.duplicate) flags.push("duplicate");
    if (r.new_subscription) flags.push("new_subscription");
    if (r.card_test) flags.push("card_test");
    const lr = await findCandidates(db, userId, { ts: r.ts, descriptor: r.descriptor, descriptorNorm: r.descriptor_norm });
    let link: LinkSummary = null;
    if (lr.best) {
      link = { exposureId: lr.best.exposureId, kind: lr.best.kind, matchScore: lr.best.matchScore, host: lr.best.host };
      flags.unshift(lr.best.kind === "expected" ? "expected_charge" : "exposure_link");
    }
    out.push({
      id: r.id, ts: r.ts.toISOString(), descriptor: r.descriptor, descriptorNorm: r.descriptor_norm, amountCents: r.amount_cents,
      mccCategory: r.mcc_category, isRecurring: r.is_recurring, flags, link,
      source: r.source, merchantName: r.merchant_name, website: r.website,
    });
  }
  return out;
}

export function listTransactionsWithFlags(db: Db, userId: string, limit = 50) {
  return build(db, userId, null, limit);
}

export async function getTransactionWithFlags(db: Db, userId: string, txnId: string) {
  return (await build(db, userId, txnId, 1))[0] ?? null;
}
