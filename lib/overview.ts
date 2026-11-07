import type { Db } from "./db";
import { many } from "./db";
import { listExposures } from "./exposures";
import { listTransactionsWithFlags } from "./rules/flags";

const ATTENTION = new Set(["exposure_link", "card_test", "price_drift", "duplicate"]);
const DAY = 86_400_000;

export async function loadOverview(db: Db, userId: string, now = new Date()) {
  const [exposures, txns, messages] = await Promise.all([
    listExposures(db, userId),
    listTransactionsWithFlags(db, userId, 100),
    many<{ id: string; body: string; kind: string; status: string; created_at: Date }>(db, "SELECT id, body, kind, status, created_at FROM messages WHERE user_id=$1 AND direction='out' ORDER BY created_at DESC LIMIT 5", [userId]),
  ]);
  const weekAgo = now.getTime() - 7 * DAY;
  const needsAttention = txns.filter((t) => Date.parse(t.ts) >= now.getTime() - 14 * DAY && t.flags.some((f) => ATTENTION.has(f)));
  return {
    exposuresThisWeek: exposures.filter((e) => Date.parse(e.createdAt) >= weekAgo).length,
    needsAttention,
    latestExposures: exposures.slice(0, 3),
    alerts: messages.map((m) => ({ id: m.id, body: m.body, status: m.status, createdAt: m.created_at.toISOString() })),
  };
}
