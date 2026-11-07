import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { runToCompletion } from "../lib/agent/runs";
import { findReplay, findReusablePageVerdict } from "../lib/agent/cache";
import { txnRulesVerdict } from "../lib/agent/txn";
import { normalizeDescriptor } from "../lib/linker/normalize";
import { VerdictSchema } from "../lib/schemas";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb("bluff_modes_test", { seed: true });
  process.env.DATABASE_URL = t.url;
});
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { process.env.MOCK_SPEED = "0"; process.env.AGENT_MODE = "mock"; });

const addExposure = async (label: string, daysAgo: number, score: number) =>
  (await t.pool.query(
    "INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,$2,$3,$4,$5,$6,'continue', now() - ($7 || ' days')::interval,'{card_number}') RETURNING id",
    [MAYA_ID, `https://${label}.x`, `${label}.x`, label, score, score < 40 ? "likely_scam" : "looks_ok", String(daysAgo)],
  )).rows[0].id as string;
const addTxn = async (descriptor: string, cents: number, scriptId: string | null = null) =>
  (await t.pool.query(
    "INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,script_id) VALUES (now(),$1,$2,$3,$4,$5) RETURNING id",
    [MAYA_ID, descriptor, normalizeDescriptor(descriptor), cents, scriptId],
  )).rows[0].id as string;

describe("page verdict reuse (24 h, live only)", () => {
  it("mock/cached results are never reused; a live verdict < 24 h is, labeled cached", async () => {
    const first = await runToCompletion({ kind: "page", userId: MAYA_ID, url: "https://fastkicks-shop", host: "fastkicks-shop", fieldTypes: [], signals: {}, source: "check" });
    expect(first.mode).toBe("cached"); // fixture, not live
    expect(await findReusablePageVerdict(t.pool, MAYA_ID, "fastkicks-shop")).toBeNull();

    await t.pool.query(
      "INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'page','reuse-me.test',$2,'live')",
      [MAYA_ID, JSON.stringify({ ...first.verdict, mode: "live", score: 11 })],
    );
    const hit = await findReusablePageVerdict(t.pool, MAYA_ID, "reuse-me.test");
    expect(hit?.verdict.mode).toBe("cached");
    const reused = await runToCompletion({ kind: "page", userId: MAYA_ID, url: "https://reuse-me.test", host: "reuse-me.test", fieldTypes: [], signals: {}, source: "check" });
    expect(reused.mode).toBe("cached");
    expect(reused.verdict.score).toBe(11);
    const bypass = await runToCompletion({ kind: "page", userId: MAYA_ID, url: "https://reuse-me.test", host: "reuse-me.test", fieldTypes: [], signals: {}, source: "check" }, { fresh: true });
    expect(bypass.verdict.score).not.toBe(11);
  });

  it("verdicts older than 24 h are not reused", async () => {
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode, created_at) VALUES ($1,'page','old.test','{}','live', now() - interval '25 hours')", [MAYA_ID]);
    expect(await findReusablePageVerdict(t.pool, MAYA_ID, "old.test")).toBeNull();
  });
});

describe("charge runs over real data (mock agent)", () => {
  it("signature charge: FKSHP*LLC links to the exposure, evidence names the real facts, mode basic", async () => {
    const exp = await addExposure("fastkicks-shop", 3, 18);
    const txn = await addTxn("FKSHP*LLC", 4999, "txn_demo_link_1");
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: txn });
    expect(VerdictSchema.safeParse(r.verdict).success).toBe(true);
    expect(r.mode).toBe("basic");
    expect(r.verdict.verdict).toBe("likely_scam");
    expect(r.verdict.linked).toMatchObject({ exposure_id: exp, txn_id: txn, kind: "flagged" });
    expect(r.verdict.evidence[0]).toBe("$49.99 from FKSHP*LLC lines up with fastkicks-shop.x");
    expect(r.verdict.evidence[1]).toBe("You entered your card there 3 days earlier");
    expect(r.verdict.evidence[2]).toContain("scored 18");
  });

  it("legit exposure + legit charge → 'expected' link, looks_ok; known merchant without exposure → looks_ok", async () => {
    await addExposure("bayou-bakery", 1, 92);
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: await addTxn("SQ *BAYOU BAKERY", 1250) });
    expect(r.verdict.verdict).toBe("looks_ok");
    expect(r.verdict.linked.kind).toBe("expected");
    const groceries = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: await addTxn("GREENLEAF GROCER 221", 5000) });
    expect(groceries.verdict.verdict).toBe("looks_ok");
    expect(groceries.verdict.linked.exposure_id).toBeUndefined();
  });

  it("unexplained charge never gets an invented link; card test is flagged", async () => {
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: await addTxn("MYSTERY CO", 2500) });
    expect(r.verdict.linked.exposure_id).toBeUndefined();
    expect(r.verdict.evidence.join(" ")).toContain("No site in your Exposure Log");
    const ct = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: await addTxn("TST* NEWPAY", 100) });
    expect(ct.verdict.category).toBe("card_testing");
  });

  it("unknown charge id → error, no crash", async () => {
    expect(await txnRulesVerdict(t.pool, MAYA_ID, "00000000-0000-4000-8000-0000000000aa")).toBeNull();
  });
});

describe("replay ladder when the AI check fails on a charge", () => {
  it("?fail → replayed fixture for the scripted signature charge (never labeled live), SQL link preserved", async () => {
    const exp = await addExposure("fastkicks-shop", 2, 18);
    const txn = await addTxn("FKSHP*LLC", 4999, "txn_demo_link_1");
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: txn }, { fail: "timeout" });
    expect(r.mode).toBe("replayed");
    expect(r.verdict.mode).toBe("replayed");
    expect(r.verdict.linked.exposure_id).toBe(exp);
    const steps = (await t.pool.query("SELECT tool FROM agent_steps WHERE run_id=$1 ORDER BY seq", [r.runId])).rows.map((x) => x.tool);
    expect(steps).toContain("exposure_lookup");
  });

  it("no prior run and no fixture → rules-only verdict labeled basic with the error surfaced", async () => {
    await addExposure("giftcard-zone", 5, 20);
    const txn = await addTxn("GIFTCARD ZONE", 3000);
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: txn }, { fail: "malformed" });
    expect(r.mode).toBe("basic");
    expect(r.verdict.linked.txn_id).toBe(txn);
  });

  it("prefers the last live run for the same charge over the fixture", async () => {
    const txn = await addTxn("FKSHP*LLC", 4999, "txn_demo_link_1");
    const run = (await t.pool.query("INSERT INTO agent_runs (user_id, trigger, subject_id, status, mode) VALUES ($1,'txn',$2,'ok','live') RETURNING id", [MAYA_ID, txn])).rows[0].id;
    const good = (await runToCompletion({ kind: "page", userId: MAYA_ID, url: "https://bayou-bakery", host: "bayou-bakery", fieldTypes: [], signals: {}, source: "check" })).verdict;
    const vid = (await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'txn',$2,$3,'live') RETURNING id", [MAYA_ID, txn, JSON.stringify({ ...good, mode: "live" })])).rows[0].id;
    await t.pool.query("UPDATE agent_runs SET verdict_id=$2 WHERE id=$1", [run, vid]);
    await t.pool.query("INSERT INTO agent_steps (run_id, seq, kind, tool, input_summary, output_summary, ms) VALUES ($1,0,'plan',NULL,'x','recorded step',5)", [run]);
    const rp = await findReplay(t.pool, MAYA_ID, txn, "txn_demo_link_1");
    expect(rp?.source).toBe("run");
    expect(rp?.replayOf).toBe(run);
    expect(rp?.verdict.mode).toBe("replayed");
  });
});
