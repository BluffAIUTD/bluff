import type { Db } from "./db";
import { many, one } from "./db";
import type { Verdict } from "./schemas";
import { findCandidates } from "./linker";
import { getTransactionWithFlags } from "./rules/flags";
import { getDisputeForTxn } from "./disputes";

export async function priceHistory(db: Db, userId: string, descriptorNorm: string, days = 90, before = new Date()) {
  const rows = await many<{ day: Date; sum_cents: string; avg_cents: number; txn_count: number }>(
    db,
    `SELECT day, sum_cents, avg_cents, txn_count FROM merchant_daily
      WHERE user_id=$1 AND descriptor_norm=$2 AND day >= ($3::timestamptz - ($4 || ' days')::interval) ORDER BY day`,
    [userId, descriptorNorm, before, String(days)],
  );
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), sumCents: Number(r.sum_cents), avgCents: r.avg_cents, count: r.txn_count }));
}

export async function latestTxnVerdict(db: Db, userId: string, txnId: string): Promise<{ id: string; payload: Verdict; created_at: Date } | null> {
  return one(db, "SELECT id, payload, created_at FROM verdicts WHERE user_id=$1 AND subject_type='txn' AND subject_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, txnId]);
}

export async function getTransactionDetail(db: Db, userId: string, txnId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(txnId)) return null;
  const txn = await getTransactionWithFlags(db, userId, txnId);
  if (!txn) return null;
  const row = await one<{ scripted: boolean; script_id: string | null }>(db, "SELECT scripted, script_id FROM transactions WHERE id=$1", [txnId]);
  const link = await findCandidates(db, userId, { ts: new Date(txn.ts), descriptor: txn.descriptor, descriptorNorm: txn.descriptorNorm });
  const v = await latestTxnVerdict(db, userId, txnId);
  const history = await priceHistory(db, userId, txn.descriptorNorm, 90, new Date(txn.ts));
  const dispute = await getDisputeForTxn(db, userId, txnId);
  return {
    transaction: { ...txn, scripted: row?.scripted ?? false, scriptId: row?.script_id ?? null },
    flags: txn.flags,
    candidates: link.candidates,
    best: link.best,
    otherCount: link.otherCount,
    verdict: v ? { id: v.id, ...v.payload, createdAt: v.created_at.toISOString() } : null,
    priceHistory: history,
    dispute,
  };
}
