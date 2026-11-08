import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTestDb, sessionCookie } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { detId } from "../lib/db/ids";
import { GET as getEval } from "../app/api/eval/route";
import { POST as evalLink } from "../app/api/eval/link/route";
import { DELETE as deleteMe } from "../app/api/me/route";
import { EVAL_CHARGES } from "../data/evalLink";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_eval_me_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { delete process.env.EVAL_RESULTS_PATH; });

const post = (body: unknown, headers: Record<string, string> = {}) => new Request("http://x/api/eval/link", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("GET /api/eval", () => {
  it("returns null results when nothing is committed (honest empty state)", async () => {
    process.env.EVAL_RESULTS_PATH = path.join(os.tmpdir(), "does-not-exist.json");
    expect(await (await getEval(new Request("http://x"))).json()).toEqual({ results: null });
  });
  it("returns valid results; rejects malformed files as null", async () => {
    const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "ev-")), "r.json");
    const good = { generated_at: "2026-11-08T01:00:00Z", claimB: { n: 20, split: "test", dataset: "synthetic", method: "m", bluff: { p: 1, r: 1, f1: 1 }, baseline: { p: 0.5, r: 0.5, f1: 0.5 }, failures: [] } };
    fs.writeFileSync(p, JSON.stringify(good)); process.env.EVAL_RESULTS_PATH = p;
    expect((await (await getEval(new Request("http://x"))).json()).results.claimB.n).toBe(20);
    fs.writeFileSync(p, "{not json"); expect((await (await getEval(new Request("http://x"))).json()).results).toBeNull();
    fs.writeFileSync(p, JSON.stringify({ nope: 1 })); expect((await (await getEval(new Request("http://x"))).json()).results).toBeNull();
  });
  it("the committed eval/results.json validates: Claim A on the held-out test split with before/after rules, calibration and per-category results; Claim B intact", async () => {
    const { results } = await (await getEval(new Request("http://x"))).json();
    const split = JSON.parse(fs.readFileSync(path.join(process.cwd(), "eval", "messages_split.json"), "utf8"));
    const a = results.claimA;
    expect(a.n).toBe(split.test.length);
    expect(a.dataset).toMatch(/NOT T-Mobile data/);
    const ids = a.methods.map((m: { id: string }) => m.id);
    expect(ids).toEqual(expect.arrayContaining(["baseline", "rules_v0", "rules"]));
    for (const m of a.methods.filter((x: { id: string }) => x.id !== "baseline")) expect(m.calibration.ece).toBeGreaterThanOrEqual(0);
    expect(a.per_category.length).toBe(25);
    expect(results.claimB.n).toBeGreaterThan(0);
  });
});

describe("POST /api/eval/link", () => {
  it("needs the eval key", async () => {
    expect((await evalLink(post({ txnId: detId("eval-txn", "p01") }))).status).toBe(403);
  });
  it("predicts the true exposure for a hard positive and null for a negative; never exposes ground truth", async () => {
    const hard = await evalLink(post({ txnId: detId("eval-txn", "p01") }, { "x-eval-key": "eval" }));
    const body = await hard.json();
    expect(body.predictedExposureId).toBe(detId("eval-exposure", "fastkicks-shop"));
    expect(Object.keys(body).sort()).toEqual(["candidateExposureId", "method", "predictedExposureId", "score"]);
    const neg = EVAL_CHARGES.find((c) => c.key === "n05")!;
    const n = await (await evalLink(post({ txnId: detId("eval-txn", neg.key) }, { "x-eval-key": "eval" }))).json();
    expect(n.predictedExposureId).toBeNull();
  });
  it("only sees the eval user's charges and 404s otherwise", async () => {
    const mayaTxn = (await t.pool.query("SELECT id FROM transactions WHERE user_id=$1 LIMIT 1", [MAYA_ID])).rows[0].id;
    expect((await evalLink(post({ txnId: mayaTxn }, { "x-eval-key": "eval" }))).status).toBe(404);
    expect((await evalLink(post({ txnId: "bad" }, { "x-eval-key": "eval" }))).status).toBe(404);
  });
});

describe("DELETE /api/me (delete everything)", () => {
  it("clears exposures, verdicts, runs, messages, disputes and game data, then re-seeds the demo user", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action) VALUES ($1,'u','h','l',10,'likely_scam','continue')", [MAYA_ID]);
    await t.pool.query("INSERT INTO verdicts (user_id,subject_type,subject_id,payload,mode) VALUES ($1,'page','h','{}','live')", [MAYA_ID]);
    await t.pool.query("INSERT INTO messages (user_id,phone,direction,body,kind) VALUES ($1,'p','out','b','alert')", [MAYA_ID]);
    await t.pool.query("INSERT INTO game_plays (user_id,day,score,streak) VALUES ($1,'2026-11-07',3,1)", [MAYA_ID]);
    await t.pool.query("INSERT INTO agent_runs (user_id,trigger,status) VALUES ($1,'page','ok')", [MAYA_ID]);
    expect((await deleteMe(new Request("http://x", { method: "DELETE", headers: sessionCookie() }))).status).toBe(204);
    for (const tbl of ["exposures", "verdicts", "messages", "game_plays", "agent_runs", "disputes"]) {
      expect(Number((await t.pool.query(`SELECT count(*) n FROM ${tbl} WHERE user_id=$1`, [MAYA_ID])).rows[0].n), tbl).toBe(0);
    }
    expect(Number((await t.pool.query("SELECT count(*) n FROM transactions WHERE user_id=$1", [MAYA_ID])).rows[0].n)).toBe(60);
    expect(Number((await t.pool.query("SELECT count(*) n FROM transactions WHERE user_id=$1", [detId("x", "x")])).rows[0].n)).toBe(0);
  });
});
