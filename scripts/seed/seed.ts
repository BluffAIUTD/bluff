import fs from "node:fs";
import path from "node:path";
import type pg from "pg";
import { ALLOWLIST_HOSTS, STORES } from "../../data/stores";
import { CARD_SEEDS } from "../../data/cards";
import { TAXONOMY } from "../../data/taxonomy";
import { EVAL_CHARGES, EVAL_EXPOSURES } from "../../data/evalLink";
import { normalizeDescriptor } from "../../lib/linker/normalize";
import { EVAL_USER_ID, MAYA_ID } from "../../lib/config";
import { detId } from "../../lib/db/ids";
import { refreshMerchantDaily } from "../../lib/db/aggregate";

const DAY = 86_400_000;

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

export async function seedGlobal(db: pg.Pool | pg.PoolClient, now = new Date()) {
  for (const s of STORES) {
    const created = new Date(now.getTime() - s.ageDays * DAY).toISOString().slice(0, 10);
    await db.query(
      `INSERT INTO mock_registry (host, created_on, registrar, brand_clone_of) VALUES ($1,$2,$3,$4)
       ON CONFLICT (host) DO UPDATE SET created_on=EXCLUDED.created_on, registrar=EXCLUDED.registrar, brand_clone_of=EXCLUDED.brand_clone_of`,
      [s.slug, created, s.registrar, s.brandCloneOf],
    );
  }
  for (const h of ALLOWLIST_HOSTS) await db.query("INSERT INTO allowlist (host, user_id) VALUES ($1, NULL) ON CONFLICT DO NOTHING", [h]);
  for (const t of TAXONOMY) {
    await db.query(
      `INSERT INTO taxonomy (id, name, description, examples, red_flags, is_placeholder) VALUES ($1,$2,$3,$4,$5,true)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, examples=EXCLUDED.examples, red_flags=EXCLUDED.red_flags`,
      [t.id, t.name, t.description, t.examples, t.redFlags],
    );
  }
  await db.query("DELETE FROM game_cards WHERE day IS NULL AND source = 'seed'");
  for (const c of CARD_SEEDS) {
    await db.query(
      "INSERT INTO game_cards (kind, content, is_scam, red_flags, category, source) VALUES ($1,$2,$3,$4,$5,'seed')",
      [c.kind, JSON.stringify(c.content), c.isScam, JSON.stringify(c.redFlags), c.category],
    );
  }
  await seedMessageDataset(db);
}

type DatasetRow = { id: string; channel: string; sender?: string | null; subject?: string | null; text: string; label: "scam" | "legit"; category: string; red_flags: { span: string; why: string }[] };

/**
 * Bluff's own synthetic scam/legit message set (data/messages/bluff-messages.jsonl, see its README) → the game's card
 * pool (source 'dataset'). Red flags are kept only if they appear verbatim. Re-runnable: replaces earlier dataset rows.
 */
export async function seedMessageDataset(db: pg.Pool | pg.PoolClient, file = path.join(process.cwd(), "data", "messages", "bluff-messages.jsonl")): Promise<number> {
  if (!fs.existsSync(file)) return 0;
  const rows = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as DatasetRow);
  await db.query("DELETE FROM game_cards WHERE source='dataset'");
  let n = 0;
  for (const r of rows) {
    const flags = (r.red_flags ?? []).filter((f) => f.span && r.text.includes(f.span));
    if (r.label === "scam" && !flags.length) continue;
    const content = { ...(r.sender ? { from: r.sender } : {}), ...(r.subject ? { subject: r.subject } : {}), body: r.text };
    await db.query("INSERT INTO game_cards (kind, content, is_scam, red_flags, category, source, origin) VALUES ($1,$2,$3,$4,$5,'dataset',$6)",
      [r.channel === "email" ? "email" : "text", JSON.stringify(content), r.label === "scam", JSON.stringify(r.label === "scam" ? flags : []), r.category, `Bluff message set · ${r.id}`]);
    n++;
  }
  return n;
}

export async function seedMaya(db: pg.Pool | pg.PoolClient, now = new Date()) {
  const phone = process.env.DEMO_USER_PHONE || null;
  await db.query("INSERT INTO users (id, name, phone, is_demo) VALUES ($1,'Maya',$2,true) ON CONFLICT (id) DO NOTHING", [MAYA_ID, phone]);
  await db.query("DELETE FROM transactions WHERE user_id = $1", [MAYA_ID]);
  for (const t of buildMayaHistory(now)) {
    await db.query(
      `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, is_recurring)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [t.ts, MAYA_ID, t.descriptor, normalizeDescriptor(t.descriptor), t.amountCents, t.mcc, !!t.recurring],
    );
  }
}

export type EvalSeedResult = { exposures: number; charges: number };

export async function seedEvalUser(db: pg.Pool | pg.PoolClient, now = new Date()): Promise<EvalSeedResult> {
  await db.query("INSERT INTO users (id, name, is_demo) VALUES ($1,'Eval user',false) ON CONFLICT (id) DO NOTHING", [EVAL_USER_ID]);
  await db.query("DELETE FROM transactions WHERE user_id=$1", [EVAL_USER_ID]);
  await db.query("DELETE FROM exposures WHERE user_id=$1", [EVAL_USER_ID]);
  const expAt = new Map<string, Date>();
  for (const e of EVAL_EXPOSURES) {
    const ts = new Date(now.getTime() - e.daysAgo * DAY);
    expAt.set(e.key, ts);
    await db.query(
      `INSERT INTO exposures (id, user_id, url, host, label, field_types, score, verdict, watch, user_action, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,false,'continue',$9)`,
      [detId("eval-exposure", e.key), EVAL_USER_ID, `https://${e.label}.example/checkout`, `${e.label}.example`, e.label, ["card_number"], e.legit ? 88 : 22, e.legit ? "looks_ok" : "likely_scam", ts],
    );
  }
  for (const c of EVAL_CHARGES) {
    const ts = c.exposure ? new Date(expAt.get(c.exposure)!.getTime() + c.day * DAY) : new Date(now.getTime() - c.day * DAY);
    await db.query(
      `INSERT INTO transactions (id, ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, true_exposure_id)
       VALUES ($1,$2,$3,$4,$5,$6,'eval',$7)`,
      [detId("eval-txn", c.key), ts, EVAL_USER_ID, c.descriptor, normalizeDescriptor(c.descriptor), c.amountCents, c.exposure ? detId("eval-exposure", c.exposure) : null],
    );
  }
  return { exposures: EVAL_EXPOSURES.length, charges: EVAL_CHARGES.length };
}

export async function seedAll(db: pg.Pool, now = new Date()) {
  await seedGlobal(db, now);
  await seedMaya(db, now);
  await seedEvalUser(db, now);
  await refreshMerchantDaily(db);
}

/** Delete everything belonging to the demo user (cascade) and re-seed it. The eval user and global data are untouched. */
export async function resetDemo(db: pg.Pool, now = new Date()) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM users WHERE id = $1", [MAYA_ID]);
    await client.query("DELETE FROM allowlist WHERE user_id = $1", [MAYA_ID]);
    await seedMaya(client, now);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  await refreshMerchantDaily(db);
}
