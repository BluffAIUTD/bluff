import fs from "node:fs";
import path from "node:path";
import type pg from "pg";
import { ALLOWLIST_HOSTS, STORES } from "../../data/stores";
import { CARD_SEEDS } from "../../data/cards";
import { RETIRED_TAXONOMY_IDS, TAXONOMY } from "../../data/taxonomy";
import { EVAL_CHARGES, EVAL_EXPOSURES } from "../../data/evalLink";
import { normalizeDescriptor } from "../../lib/linker/normalize";
import { mayaOptions, resetAccount, seedDemoHistory } from "../../lib/accounts";
import { EVAL_USER_ID, MAYA_ID } from "../../lib/config";
import { detId } from "../../lib/db/ids";
import { refreshMerchantDaily } from "../../lib/db/aggregate";

const DAY = 86_400_000;

export { buildMayaHistory, type SeedTxn } from "../../lib/accounts";

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
  await seedTaxonomy(db);
  await upsertPoolCards(db, "seed", CARD_SEEDS.map((c, i) => ({
    kind: c.kind, content: c.content, is_scam: c.isScam, red_flags: c.redFlags, category: c.category,
    origin: `Bluff starter card · ${String(i + 1).padStart(2, "0")}`, difficulty: "medium", why_legit: null,
  })));
  await seedMessageDataset(db);
}

type PoolCard = {
  kind: string; content: { from?: string; subject?: string; body: string }; is_scam: boolean; red_flags: { span: string; why: string }[];
  category: string; origin: string; difficulty: "easy" | "medium" | "hard"; why_legit: string | null;
};

/**
 * Shared game cards keyed by (source, origin): existing rows are updated in place so their ids survive a reseed (a
 * frozen daily set and in-progress games keep pointing at them); new ones are inserted; ones no longer listed are removed.
 */
async function upsertPoolCards(db: pg.Pool | pg.PoolClient, source: "seed" | "dataset", cards: PoolCard[]) {
  await db.query(
    `WITH data AS (
       SELECT * FROM jsonb_to_recordset($2::jsonb)
         AS d(kind text, content jsonb, is_scam boolean, red_flags jsonb, category text, origin text, difficulty text, why_legit text)),
     upd AS (
       UPDATE game_cards g SET kind=d.kind, content=d.content, is_scam=d.is_scam, red_flags=d.red_flags, category=d.category,
              difficulty=d.difficulty, why_legit=d.why_legit
         FROM data d WHERE g.source=$1 AND g.day IS NULL AND g.user_id IS NULL AND g.origin=d.origin RETURNING g.origin)
     INSERT INTO game_cards (kind, content, is_scam, red_flags, category, source, origin, difficulty, why_legit)
     SELECT d.kind, d.content, d.is_scam, d.red_flags, d.category, $1, d.origin, d.difficulty, d.why_legit
       FROM data d WHERE d.origin NOT IN (SELECT origin FROM upd)`,
    [source, JSON.stringify(cards)],
  );
  await db.query("DELETE FROM game_cards WHERE source=$1 AND day IS NULL AND NOT (coalesce(origin, '') = ANY($2::text[]))", [source, cards.map((c) => c.origin)]);
}

type DatasetRow = {
  id: string; channel: string; sender?: string | null; subject?: string | null; text: string; label: "scam" | "legit"; category: string;
  difficulty?: string | null; red_flags: { span: string; why: string }[]; why_legit?: string | null;
};

/**
 * Bluff's own synthetic scam/legit message set (data/messages/bluff-messages.jsonl, see its README) → the game's card
 * pool (source 'dataset'), with each message's difficulty and "why legit" line. Red flags are kept only if they appear
 * verbatim in the text. Re-runnable: rows are updated in place by their message id (origin "Bluff message set · bm-NNNN").
 */
export async function seedMessageDataset(db: pg.Pool | pg.PoolClient, file = path.join(process.cwd(), "data", "messages", "bluff-messages.jsonl")): Promise<number> {
  if (!fs.existsSync(file)) return 0;
  const rows = fs.readFileSync(file, "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as DatasetRow);
  const cards: PoolCard[] = [];
  for (const r of rows) {
    const flags = (r.red_flags ?? []).filter((f) => f.span && r.text.includes(f.span));
    if (r.label === "scam" && !flags.length) continue;
    const scam = r.label === "scam";
    cards.push({
      kind: r.channel === "email" ? "email" : "text",
      content: { ...(r.sender ? { from: r.sender } : {}), ...(r.subject ? { subject: r.subject } : {}), body: r.text },
      is_scam: scam, red_flags: scam ? flags : [], category: r.category, origin: `Bluff message set · ${r.id}`,
      difficulty: r.difficulty === "easy" || r.difficulty === "hard" ? r.difficulty : "medium",
      why_legit: !scam && r.why_legit ? r.why_legit : null,
    });
  }
  await upsertPoolCards(db, "dataset", cards);
  return cards.length;
}

/** The template persona: Maya plus her 60 seeded transactions (each visitor's account gets a copy of the same history). */
export async function seedMaya(db: pg.Pool | pg.PoolClient, now = new Date()) {
  const o = mayaOptions(now);
  await db.query("INSERT INTO users (id, name, phone, is_demo) VALUES ($1,$2,$3,true) ON CONFLICT (id) DO NOTHING", [MAYA_ID, o.name, o.phone]);
  await seedDemoHistory(db, MAYA_ID, now);
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

/** Delete everything belonging to the template persona (cascade) and re-seed it. Visitors' accounts, the eval user and global data are untouched. */
export async function resetDemo(db: pg.Pool, now = new Date()) {
  await resetAccount(db, MAYA_ID, mayaOptions(now));
}

/**
 * Bluff's 25-category taxonomy (data/taxonomy.ts): upserts every row (is_placeholder=false) and removes the retired
 * placeholder ids. Idempotent and safe on a database seeded with the old 11-row placeholder. A row whose text changed loses
 * its embedding, so taxonomy_match uses keywords until `npm run embed-taxonomy` runs again; unchanged rows keep theirs.
 */
export async function seedTaxonomy(db: pg.Pool | pg.PoolClient): Promise<number> {
  for (const t of TAXONOMY) {
    await db.query(
      `INSERT INTO taxonomy (id, name, description, examples, red_flags, is_placeholder) VALUES ($1,$2,$3,$4,$5,false)
       ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, examples=EXCLUDED.examples, red_flags=EXCLUDED.red_flags,
         is_placeholder=false,
         embedding=CASE WHEN (taxonomy.name, taxonomy.description, taxonomy.examples, taxonomy.red_flags) IS NOT DISTINCT FROM (EXCLUDED.name, EXCLUDED.description, EXCLUDED.examples, EXCLUDED.red_flags) THEN taxonomy.embedding END`,
      [t.id, t.name, t.description, t.examples, t.redFlags],
    );
  }
  await db.query("DELETE FROM taxonomy WHERE id = ANY($1::text[])", [RETIRED_TAXONOMY_IDS]);
  return TAXONOMY.length;
}
