import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { extractJson, generateCards, lookalikeCategory, validateCard } from "../lib/gamegen";
import { cardsForDay } from "../lib/game";
import { POST as generateRoute } from "../app/api/game/generate/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
let server: http.Server;
let reply: { status: number; content?: string } = { status: 200 };
let calls = 0;
const good = { kind: "text", content: { from: "+1 555", body: "Zorbly Parcels: pay a $2 fee within 6 hrs at zorbly-fee.top" }, is_scam: true, category: "delivery_fee", red_flags: [{ span: "within 6 hrs", why: "fake deadline" }, { span: "not in the text", why: "dropped" }] };
const legit = { kind: "text", content: { body: "Maple Dental: see you tomorrow at 3 PM. Reply C to confirm." }, is_scam: false, category: "legit_transactional", red_flags: [] };

beforeAll(async () => {
  t = await createTestDb("bluff_gamegen_test", { seed: true });
  process.env.DATABASE_URL = t.url;
  server = http.createServer((rq, rs) => { calls++; rq.resume(); rq.on("end", () => { rs.writeHead(reply.status, { "content-type": "application/json" }); rs.end(JSON.stringify({ choices: [{ message: { content: reply.content ?? "" } }] })); }); });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.NVIDIA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`; process.env.NVIDIA_API_KEY = "k"; process.env.NEMOTRON_MODEL = "m"; process.env.AGENT_MODE = "live";
});
afterAll(async () => { server.close(); await closePool(); await t.drop(); });
beforeEach(async () => { calls = 0; reply = { status: 200 }; await t.pool.query("DELETE FROM game_cards WHERE source <> 'seed'"); await t.pool.query("DELETE FROM bluff_meta WHERE key LIKE 'game_set:%'"); });

describe("validateCard", () => {
  it("keeps only verbatim red-flag spans; scam cards need ≥ 1; legit cards carry none", () => {
    expect(validateCard(good)?.red_flags).toEqual([{ span: "within 6 hrs", why: "fake deadline" }]);
    expect(validateCard({ ...good, red_flags: [{ span: "missing", why: "x" }] })).toBeNull();
    expect(validateCard({ ...legit, red_flags: [{ span: "Maple", why: "x" }] })?.red_flags).toEqual([]);
  });
  it("rejects real brands, >300 chars, bad kinds, junk", () => {
    expect(validateCard({ ...good, content: { body: "PayPal: pay a fee within 6 hrs" }, red_flags: [{ span: "within 6 hrs", why: "x" }] })).toBeNull();
    expect(validateCard({ ...legit, content: { body: "x".repeat(301) } })).toBeNull();
    expect(validateCard({ ...legit, kind: "carrier_pigeon" })).toBeNull();
    expect(validateCard(null)).toBeNull();
    expect(validateCard({ kind: "text" })).toBeNull();
  });
  it("extractJson handles fences and prose around the JSON", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('Sure! {"a":2} hope that helps')).toEqual({ a: 2 });
    expect(extractJson("no json")).toBeNull();
  });
});

describe("generateCards", () => {
  it("inserts valid cards for the day, drops invalid ones, and they enter that day's set", async () => {
    reply = { status: 200, content: JSON.stringify({ cards: [good, legit, { ...good, content: { body: "Amazon: pay now within 6 hrs" } }, { nonsense: true }] }) };
    const r = await generateCards(t.pool, "2026-12-01");
    expect(r).toMatchObject({ inserted: 2, dropped: 2 });
    expect(Number((await t.pool.query("SELECT count(*) n FROM game_cards WHERE day='2026-12-01'")).rows[0].n)).toBe(2);
    const set = await cardsForDay(t.pool, "2026-12-01");
    expect(set).toHaveLength(5);
    expect(set.some((c) => c.source !== "seed")).toBe(true);
  });

  it("falls back silently to the pool on model errors, garbage, or all-invalid cards", async () => {
    reply = { status: 500 };
    expect((await generateCards(t.pool, "2026-12-02")).inserted).toBe(0);
    reply = { status: 200, content: "I cannot do that" };
    expect((await generateCards(t.pool, "2026-12-02")).reason).toMatch(/unreadable/);
    reply = { status: 200, content: JSON.stringify({ cards: [{ x: 1 }] }) };
    expect((await generateCards(t.pool, "2026-12-02")).inserted).toBe(0);
    expect(await cardsForDay(t.pool, "2026-12-02")).toHaveLength(5); // seeded pool still works
  });

  it("is idempotent per day and a no-op without a configured model", async () => {
    reply = { status: 200, content: JSON.stringify({ cards: [legit] }) };
    await generateCards(t.pool, "2026-12-03");
    const before = calls;
    expect((await generateCards(t.pool, "2026-12-03")).reason).toBe("already generated");
    expect(calls).toBe(before);
    process.env.AGENT_MODE = "mock";
    expect((await generateCards(t.pool, "2026-12-04")).reason).toMatch(/not configured/);
    process.env.AGENT_MODE = "live";
  });

  it("lookalike: seeds one card from this week's most-flagged category", async () => {
    for (let i = 0; i < 3; i++) await t.pool.query("INSERT INTO verdicts (user_id,subject_type,subject_id,payload,mode) VALUES ($1,'page','h',$2,'live')", [MAYA_ID, JSON.stringify({ verdict: "likely_scam", category: "toll_scam" })]);
    await t.pool.query("INSERT INTO verdicts (user_id,subject_type,subject_id,payload,mode) VALUES ($1,'page','h',$2,'live')", [MAYA_ID, JSON.stringify({ verdict: "likely_scam", category: "delivery_fee" })]);
    await t.pool.query("INSERT INTO verdicts (user_id,subject_type,subject_id,payload,mode,created_at) VALUES ($1,'page','h',$2,'live', now() - interval '10 days')", [MAYA_ID, JSON.stringify({ verdict: "likely_scam", category: "investment" })]);
    expect(await lookalikeCategory(t.pool)).toBe("toll_scam");
    reply = { status: 200, content: JSON.stringify({ cards: [{ ...good, category: "toll_scam", content: { body: "Zorbly Tolls: final notice, pay within 6 hrs at zorbly-toll.top" } }] }) };
    expect((await generateCards(t.pool, "2026-12-05")).lookalike).toBe("toll_scam");
    expect((await t.pool.query("SELECT source FROM game_cards WHERE day='2026-12-05'")).rows[0].source).toBe("lookalike");
  });
});

describe("POST /api/game/generate", () => {
  const post = (headers: Record<string, string> = {}) => generateRoute(new Request("http://x/api/game/generate", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify({ day: "2026-12-06" }) }));
  it("needs the demo key in production, works with it", async () => {
    reply = { status: 200, content: JSON.stringify({ cards: [legit] }) };
    process.env.DEMO_KEY = "k"; (process.env as Record<string, string>).NODE_ENV = "production"; process.env.SESSION_SECRET = "s";
    expect((await post()).status).toBe(403);
    const ok = await post({ "x-demo-key": "k" });
    expect(ok.status).toBe(200);
    expect((await ok.json())).toMatchObject({ day: "2026-12-06", inserted: 1 });
    delete (process.env as Record<string, string>).NODE_ENV; delete process.env.SESSION_SECRET;
  });
});
