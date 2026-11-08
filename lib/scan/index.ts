import type { Db } from "../db";
import { getPool, many } from "../db";
import { startRun } from "../agent/runs";
import { syncFromNessie, type SyncResult } from "../nessie/sync";
import type { Verdict } from "../schemas";

export type ScanMerchant = {
  key: string; merchant: string; host: string | null; descriptor: string; category: string | null;
  txns: { id: string; ts: string; amountCents: number }[]; totalCents: number;
  runId?: string; verdict?: (Verdict & { scannedAt: string }) | null;
};

type Row = { id: string; ts: Date; descriptor: string; amount_cents: number; merchant_name: string | null; website: string | null; mcc_category: string | null };

/** Recent bank transactions grouped by merchant website (one scan per site, not per charge). Newest charge first. */
export async function recentMerchants(db: Db, userId: string, days = 45): Promise<ScanMerchant[]> {
  const rows = await many<Row>(db,
    `SELECT id, ts, descriptor, amount_cents, merchant_name, website, mcc_category FROM transactions
      WHERE user_id=$1 AND source='nessie' AND ts > now() - ($2 || ' days')::interval ORDER BY ts DESC`, [userId, String(days)]);
  const groups = new Map<string, ScanMerchant>();
  for (const r of rows) {
    const key = r.website ?? `merchant:${(r.merchant_name ?? r.descriptor).toLowerCase()}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, merchant: r.merchant_name ?? r.descriptor, host: r.website, descriptor: r.descriptor, category: r.mcc_category, txns: [], totalCents: 0 };
      groups.set(key, g);
    }
    g.txns.push({ id: r.id, ts: r.ts.toISOString(), amountCents: r.amount_cents });
    g.totalCents += r.amount_cents;
  }
  return [...groups.values()];
}

/** Latest site verdict per host/merchant key. */
export async function latestSiteVerdicts(db: Db, userId: string, keys: string[]): Promise<Map<string, Verdict & { scannedAt: string }>> {
  if (!keys.length) return new Map();
  const rows = await many<{ subject_id: string; payload: Verdict; created_at: Date }>(db,
    `SELECT DISTINCT ON (subject_id) subject_id, payload, created_at FROM verdicts
      WHERE user_id=$1 AND subject_type='site' AND subject_id = ANY($2) ORDER BY subject_id, created_at DESC`, [userId, keys]);
  return new Map(rows.map((r) => [r.subject_id, { ...r.payload, scannedAt: r.created_at.toISOString() }]));
}

export type ScanState = { sync: SyncResult | null; merchants: ScanMerchant[]; error?: string };

/** Current state without starting anything: merchants from the last sync with their latest verdicts. */
export async function scanState(userId: string): Promise<ScanState> {
  const db = getPool();
  const merchants = await recentMerchants(db, userId);
  const v = await latestSiteVerdicts(db, userId, merchants.map((m) => m.key));
  return { sync: null, merchants: merchants.map((m) => ({ ...m, verdict: v.get(m.key) ?? null })) };
}

/**
 * The bank scan: pull fresh transactions from Capital One Nessie, then start one Nemotron site run per merchant.
 * Runs execute in the background (≤ 3 at once); the client follows each through /api/runs/:id/stream.
 */
export async function startBankScan(userId: string, opts: { fresh?: boolean } = {}): Promise<ScanState> {
  const db = getPool();
  const sync = await syncFromNessie(db, userId);
  const merchants = await recentMerchants(db, userId);
  for (const m of merchants) {
    const latest = m.txns[0];
    const { runId } = await startRun({ kind: "site", userId, txnId: latest.id, host: m.host, merchant: m.merchant, descriptor: m.descriptor }, { fresh: opts.fresh });
    m.runId = runId;
  }
  return { sync, merchants };
}
