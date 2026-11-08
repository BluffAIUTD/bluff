import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import { migrate } from "../../lib/db/migrate";
import { seedAll, resetDemo, buildMayaHistory, seedTaxonomy } from "./seed";
import { EVAL_USER_ID, MAYA_ID } from "../../lib/config";
import { EVAL_CHARGES, EVAL_EXPOSURES } from "../../data/evalLink";
import { CARD_SEEDS } from "../../data/cards";
import { linkScore, LINK_THRESHOLD } from "../../lib/linker/score";
import { normalizeDescriptor } from "../../lib/linker/normalize";

const DB = "bluff_seed_test" + (process.env.TEST_DB_SUFFIX ? "_" + process.env.TEST_DB_SUFFIX.replace(/[^a-z0-9_]/gi, "").toLowerCase() : "");
let pool: pg.Pool;
const NOW = new Date("2026-11-07T18:00:00Z");

beforeAll(async () => {
  const admin = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/postgres" });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.query(`CREATE DATABASE ${DB}`);
  await admin.end();
  pool = new pg.Pool({ connectionString: `postgres://postgres:postgres@localhost:5432/${DB}` });
  await migrate(pool);
});
afterAll(async () => {
  await pool.end();
  const admin = new pg.Pool({ connectionString: "postgres://postgres:postgres@localhost:5432/postgres" });
  await admin.query(`DROP DATABASE IF EXISTS ${DB}`);
  await admin.end();
});

const count = async (sql: string, args: unknown[] = []) => Number((await pool.query(sql, args)).rows[0].n);

describe("seed", () => {
  it("history is exactly 60 transactions in the last 90 days, none in the future", () => {
    const h = buildMayaHistory(NOW);
    expect(h).toHaveLength(60);
    for (const t of h) {
      expect(t.ts.getTime()).toBeLessThanOrEqual(NOW.getTime());
      expect(t.ts.getTime()).toBeGreaterThan(NOW.getTime() - 91 * 86_400_000);
    }
    expect(buildMayaHistory(NOW).map((t) => t.ts.getTime())).toEqual(h.map((t) => t.ts.getTime())); // deterministic
  });

  it("seeds all tables with spec counts and is re-runnable", async () => {
    await seedAll(pool, NOW);
    await seedAll(pool, NOW);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [MAYA_ID])).toBe(60);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [EVAL_USER_ID])).toBe(30);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1 AND true_exposure_id IS NOT NULL", [EVAL_USER_ID])).toBe(20);
    expect(await count("SELECT count(*) n FROM mock_registry")).toBe(10);
    expect(await count("SELECT count(*) n FROM game_cards WHERE day IS NULL AND source='seed'")).toBe(15);
    expect(await count("SELECT count(*) n FROM game_cards WHERE source='dataset'")).toBeGreaterThanOrEqual(300); // data/messages/bluff-messages.jsonl
    expect(await count("SELECT count(*) n FROM allowlist WHERE user_id IS NULL")).toBeGreaterThanOrEqual(50);
    // Bluff's own 25-category taxonomy (data/taxonomy.ts): 17 scam rows with red flags, 8 legit rows without.
    expect(await count("SELECT count(*) n FROM taxonomy")).toBe(25);
    expect(await count("SELECT count(*) n FROM taxonomy WHERE is_placeholder")).toBe(0);
    expect(await count("SELECT count(*) n FROM taxonomy WHERE cardinality(red_flags) > 0")).toBe(17);
    expect(await count("SELECT count(*) n FROM merchant_daily WHERE user_id=$1", [MAYA_ID])).toBeGreaterThan(20);
  });

  it("taxonomy upsert replaces the old placeholder rows in place and keeps embeddings only for unchanged rows", async () => {
    await pool.query("INSERT INTO taxonomy (id, name, description, examples, red_flags, is_placeholder) VALUES ('investment','Investment','old','{}','{}',true) ON CONFLICT (id) DO NOTHING");
    await pool.query("UPDATE taxonomy SET description='old placeholder text', is_placeholder=true, embedding='{0.1,0.2}' WHERE id='toll_scam'");
    await pool.query("UPDATE taxonomy SET embedding='{0.3,0.4}' WHERE id='romance'");
    expect(await seedTaxonomy(pool)).toBe(25);
    expect(await count("SELECT count(*) n FROM taxonomy")).toBe(25);
    expect(await count("SELECT count(*) n FROM taxonomy WHERE id='investment'")).toBe(0);
    const row = async (id: string) => (await pool.query("SELECT description, is_placeholder, embedding FROM taxonomy WHERE id=$1", [id])).rows[0];
    expect(await row("toll_scam")).toMatchObject({ is_placeholder: false, embedding: null });
    expect((await row("toll_scam")).description).not.toBe("old placeholder text");
    expect((await row("romance")).embedding).toEqual([0.3, 0.4]);
  });

  it("registry ages: scam stores are young, legit are old", async () => {
    const r = (await pool.query("SELECT host, ('2026-11-07'::date - created_on) AS age FROM mock_registry")).rows;
    const age = Object.fromEntries(r.map((x) => [x.host, Number(x.age)]));
    expect(age["fastkicks-shop"]).toBe(4);
    expect(age["bayou-bakery"]).toBeGreaterThan(1000);
  });

  it("reset restores the demo user without touching the eval user", async () => {
    await pool.query("DELETE FROM transactions WHERE user_id=$1 AND descriptor LIKE 'GREENLEAF%'", [MAYA_ID]);
    await pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action) VALUES ($1,'u','h','l',10,'likely_scam','continue')", [MAYA_ID]);
    await resetDemo(pool, NOW);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [MAYA_ID])).toBe(60);
    expect(await count("SELECT count(*) n FROM exposures WHERE user_id=$1", [MAYA_ID])).toBe(0);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [EVAL_USER_ID])).toBe(30);
  });
});

describe("static data integrity", () => {
  it("game card red-flag spans appear verbatim; scam cards have flags; 9 scam / 6 legit", () => {
    expect(CARD_SEEDS).toHaveLength(15);
    for (const c of CARD_SEEDS) {
      const text = [c.content.from, c.content.subject, c.content.body].filter(Boolean).join("\n");
      for (const f of c.redFlags) expect(text).toContain(f.span);
      if (c.isScam) expect(c.redFlags.length).toBeGreaterThanOrEqual(1); else expect(c.redFlags).toHaveLength(0);
    }
    expect(CARD_SEEDS.filter((c) => c.isScam)).toHaveLength(9);
  });

  it("claim B set: 20 positives + 10 negatives, 10 dev / 20 test, ≥ 6 hard", () => {
    expect(EVAL_CHARGES.filter((c) => c.exposure)).toHaveLength(20);
    expect(EVAL_CHARGES.filter((c) => !c.exposure)).toHaveLength(10);
    expect(EVAL_CHARGES.filter((c) => c.split === "dev")).toHaveLength(10);
    expect(EVAL_CHARGES.filter((c) => c.split === "test")).toHaveLength(20);
    expect(EVAL_CHARGES.filter((c) => c.hard).length).toBeGreaterThanOrEqual(6);
  });

  it("every ground-truth positive clears the link threshold and no negative does (sanity of the authored data)", () => {
    const exp = new Map(EVAL_EXPOSURES.map((e) => [e.key, new Date(NOW.getTime() - e.daysAgo * 86_400_000)]));
    const best = (c: (typeof EVAL_CHARGES)[number]) => {
      const txnAt = c.exposure ? new Date(exp.get(c.exposure)!.getTime() + c.day * 86_400_000) : new Date(NOW.getTime() - c.day * 86_400_000);
      let top: { key: string; s: number } | null = null;
      for (const e of EVAL_EXPOSURES) {
        const r = linkScore({ descriptor: c.descriptor, descriptorNorm: normalizeDescriptor(c.descriptor), label: e.label, exposureAt: exp.get(e.key)!, txnAt });
        if (r && (!top || r.score > top.s)) top = { key: e.key, s: r.score };
      }
      return top;
    };
    const bad: string[] = [];
    for (const c of EVAL_CHARGES) {
      const t = best(c);
      if (c.exposure) { if (!t || t.key !== c.exposure || t.s < LINK_THRESHOLD) bad.push(`${c.key} missed (${JSON.stringify(t)})`); }
      else if (t && t.s >= LINK_THRESHOLD) bad.push(`${c.key} false link ${JSON.stringify(t)}`);
    }
    expect(bad).toEqual([]);
  });
});
