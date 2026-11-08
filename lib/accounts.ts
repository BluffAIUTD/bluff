import type pg from "pg";
import { withTx } from "./db";
import { refreshMerchantDaily } from "./db/aggregate";
import { normalizeDescriptor } from "./linker/normalize";

/**
 * Accounts. Every browser session is its own private account (no login): the first request from a new session creates
 * the user and gives it a copy of the demo persona's 90-day card history, so each visitor gets the full demo to themselves.
 * Maya (MAYA_ID in ./config) remains the template persona used by scripts (prewarm, db:reset) and SMS from unknown numbers.
 */

const DAY = 86_400_000;
export const DEMO_PERSONA = "Maya";

function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SeedTxn = { ts: Date; descriptor: string; amountCents: number; mcc: string; recurring?: boolean };

/** Exactly 60 deterministic transactions over the 90 days before `now` (product: ~60 seeded over 90 days). */
export function buildMayaHistory(now: Date): SeedTxn[] {
  const r = prng(42);
  const at = (daysAgo: number, hour = 10 + Math.floor(r() * 8), minute = Math.floor(r() * 60)) => {
    const d = new Date(now.getTime() - daysAgo * DAY);
    d.setUTCHours(hour, minute, 0, 0);
    if (d > now) d.setTime(now.getTime() - 3_600_000);
    return d;
  };
  const between = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo));
  const out: SeedTxn[] = [];
  for (let i = 0; i < 12; i++) out.push({ ts: at(3 + 7 * i), descriptor: "GREENLEAF GROCER 221", amountCents: between(3500, 9500), mcc: "grocery" });
  for (const d of [85, 55, 25]) out.push({ ts: at(d, 8, 5), descriptor: "STREAMBOX.COM", amountCents: 1599, mcc: "streaming", recurring: true });
  for (const d of [80, 50, 20]) out.push({ ts: at(d, 6, 0), descriptor: "CITY POWER & WATER", amountCents: 8900, mcc: "utilities", recurring: true });
  for (let i = 0; i < 8; i++) out.push({ ts: at(between(2, 88)), descriptor: "RIDELO *TRIP", amountCents: between(800, 2500), mcc: "rideshare" });
  const dup = at(20, 17, 14);
  out.push({ ts: dup, descriptor: "RIDELO *TRIP", amountCents: 1450, mcc: "rideshare" });
  out.push({ ts: new Date(dup.getTime() + 3 * 60_000), descriptor: "RIDELO *TRIP", amountCents: 1450, mcc: "rideshare" });
  for (let i = 0; i < 9; i++) out.push({ ts: at(between(1, 89)), descriptor: "SQ *BAYOU BAKERY", amountCents: between(600, 1400), mcc: "food" });
  for (const d of [70, 41, 12]) out.push({ ts: at(d), descriptor: "NORTHLOOP BOOKS", amountCents: between(1500, 3500), mcc: "books" });
  out.push({ ts: at(33), descriptor: "PAYPAL *CAMPUSTECH", amountCents: 1299, mcc: "electronics" });
  out.push({ ts: at(61), descriptor: "PAYPAL *CAMPUSTECH", amountCents: 4999, mcc: "electronics" });
  out.push({ ts: at(47), descriptor: "LONESTAR TICKETS", amountCents: 9800, mcc: "entertainment" });
  out.push({ ts: at(15), descriptor: "LONESTAR TICKETS", amountCents: 6500, mcc: "entertainment" });
  for (let i = 0; i < 8; i++) out.push({ ts: at(between(1, 89)), descriptor: "SQ *BLUEDOOR COFFEE", amountCents: between(450, 700), mcc: "food" });
  for (const d of [66, 38, 9]) out.push({ ts: at(d), descriptor: "GREENCROSS PHARMACY", amountCents: between(1200, 3400), mcc: "pharmacy" });
  for (const d of [76, 52, 29, 7]) out.push({ ts: at(d), descriptor: "FUEL STOP 118", amountCents: between(3200, 5200), mcc: "fuel" });
  out.push({ ts: at(6, 23, 41), descriptor: "TST* QWKPAY", amountCents: 100, mcc: "other" }); // card test
  return out.sort((a, b) => a.ts.getTime() - b.ts.getTime());
}

/** Replace a user's seeded card history with the demo persona's (one multi-row insert). */
export async function seedDemoHistory(db: pg.Pool | pg.PoolClient, userId: string, now = new Date()) {
  await db.query("DELETE FROM transactions WHERE user_id = $1", [userId]);
  const h = buildMayaHistory(now);
  await db.query(
    `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, is_recurring)
     SELECT t.ts, $1, t.d, t.n, t.a, t.m, t.r
       FROM unnest($2::timestamptz[], $3::text[], $4::text[], $5::int[], $6::text[], $7::bool[]) AS t(ts, d, n, a, m, r)`,
    [userId, h.map((t) => t.ts), h.map((t) => t.descriptor), h.map((t) => normalizeDescriptor(t.descriptor)), h.map((t) => t.amountCents), h.map((t) => t.mcc), h.map((t) => !!t.recurring)],
  );
}

type AccountOptions = { name?: string; phone?: string | null; now?: Date };

/** merchant_daily feeds charge history; refresh it after seeding (outside the transaction: Timescale requires that). */
const refreshAggregate = (pool: pg.Pool) => refreshMerchantDaily(pool).catch((e) => console.error("[accounts] aggregate refresh failed", (e as Error).message));

// ---- provisioning ---------------------------------------------------------------------------------------------------
const g = globalThis as unknown as { __bluffAccounts?: { ready: Set<string>; pending: Map<string, Promise<boolean>> } };
const known = (g.__bluffAccounts ??= { ready: new Set(), pending: new Map() });
const MAX_KNOWN = 50_000;

/**
 * Make sure the account exists, creating it with the demo history on first use. Returns true when it was just created.
 * Concurrent first requests from one browser share a single creation; a process remembers accounts it has already seen.
 */
export function ensureAccount(pool: pg.Pool, userId: string, o: AccountOptions = {}): Promise<boolean> {
  if (known.ready.has(userId)) return Promise.resolve(false);
  const inflight = known.pending.get(userId);
  if (inflight) return inflight;
  const p = (async () => {
    const created = await withTx(async (c) => {
      const r = await c.query("INSERT INTO users (id, name, phone, is_demo) VALUES ($1,$2,$3,true) ON CONFLICT (id) DO NOTHING RETURNING id", [userId, o.name ?? DEMO_PERSONA, o.phone ?? null]);
      if (!r.rowCount) return false;
      await seedDemoHistory(c, userId, o.now);
      return true;
    }, pool);
    if (created) await refreshAggregate(pool);
    if (known.ready.size >= MAX_KNOWN) known.ready.clear();
    known.ready.add(userId);
    return created;
  })().finally(() => known.pending.delete(userId));
  known.pending.set(userId, p);
  return p;
}

/**
 * "Delete everything" for one account: drops the user (exposures, verdicts, runs, disputes, messages, game plays and
 * crawls cascade), their allowlist entries and bank-link metadata, then re-creates it with a fresh demo history.
 * Other accounts are untouched.
 */
export async function resetAccount(pool: pg.Pool, userId: string, o: AccountOptions = {}) {
  await withTx(async (c) => {
    await c.query("DELETE FROM users WHERE id = $1", [userId]);
    await c.query("DELETE FROM allowlist WHERE user_id = $1", [userId]);
    await c.query("DELETE FROM bluff_meta WHERE key = $1", [`nessie_account:${userId}`]);
    await c.query("INSERT INTO users (id, name, phone, is_demo) VALUES ($1,$2,$3,true)", [userId, o.name ?? DEMO_PERSONA, o.phone ?? null]);
    await seedDemoHistory(c, userId, o.now);
  }, pool);
  known.ready.add(userId);
  await refreshAggregate(pool);
}

/** The template persona keeps its phone number (DEMO_USER_PHONE) so real SMS from that number reaches it. */
export const mayaOptions = (now?: Date): AccountOptions => ({ name: DEMO_PERSONA, phone: process.env.DEMO_USER_PHONE || null, now });
