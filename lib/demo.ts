import type pg from "pg";
import { SCRIPTS, type Script } from "../data/stores";
import { one } from "./db";
import { refreshMerchantDaily } from "./db/aggregate";
import { normalizeDescriptor } from "./linker/normalize";

const DAY = 86_400_000;
/** How long after the exposure a scripted scam charge "posts" in the demo (time-passing is simulated, and labeled so in the UI). */
export const SIMULATED_DELAY_DAYS = 3;
export const SIMULATED_LEGIT_DELAY_DAYS = 1;

export function findScript(opts: { scriptId?: string; storeSlug?: string }): Script | null {
  if (opts.scriptId) return SCRIPTS.find((s) => s.id === opts.scriptId) ?? null;
  if (opts.storeSlug) return SCRIPTS.find((s) => s.storeSlug === opts.storeSlug) ?? null;
  return null;
}

/** Next scripted charge not yet posted for this user (signature first). */
export async function nextScript(db: pg.Pool, userId: string): Promise<Script | null> {
  const posted = new Set((await db.query("SELECT DISTINCT script_id FROM transactions WHERE user_id=$1 AND script_id IS NOT NULL", [userId])).rows.map((r) => r.script_id as string));
  return SCRIPTS.find((s) => !posted.has(s.id)) ?? null;
}

export type PostedCharge = { id: string; script: Script; ts: Date; simulatedDelayDays: number | null; created: boolean };

/**
 * Insert a scripted charge. If the user has an exposure for the script's store, the charge is dated a few days AFTER that
 * exposure (simulated time passing) so the linker's time window and "charged N days after exposure" are real; otherwise it
 * posts now. Idempotent per (script, exposure): re-posting returns the existing charge.
 */
export async function postScriptedCharge(db: pg.Pool, userId: string, script: Script, now = new Date()): Promise<PostedCharge> {
  let ts = now;
  let delay: number | null = null;
  if (script.storeSlug) {
    const exp = await one<{ created_at: Date; score: number }>(db, "SELECT created_at, score FROM exposures WHERE user_id=$1 AND label=$2 ORDER BY created_at DESC LIMIT 1", [userId, script.storeSlug]);
    if (exp) {
      delay = exp.score < 40 ? SIMULATED_DELAY_DAYS : SIMULATED_LEGIT_DELAY_DAYS;
      ts = new Date(exp.created_at.getTime() + delay * DAY);
    }
  }
  const existing = await one<{ id: string }>(db, "SELECT id FROM transactions WHERE user_id=$1 AND script_id=$2 AND ts=$3", [userId, script.id, ts]);
  if (existing) return { id: existing.id, script, ts, simulatedDelayDays: delay, created: false };
  const row = (await db.query(
    `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, is_recurring, scripted, script_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8) RETURNING id`,
    [ts, userId, script.descriptor, normalizeDescriptor(script.descriptor), script.amountCents, script.mcc, !!script.recurring, script.id],
  )).rows[0];
  await refreshMerchantDaily(db);
  return { id: row.id, script, ts, simulatedDelayDays: delay, created: true };
}
