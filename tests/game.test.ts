import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { GET as today } from "../app/api/game/today/route";
import { POST as answer } from "../app/api/game/answer/route";
import { POST as finish } from "../app/api/game/finish/route";
import { cardsForDay, dayKey, finishGame, pickCards, puzzleNumber, shareText } from "../lib/game";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_game_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => { await t.pool.query("DELETE FROM game_plays"); await t.pool.query("DELETE FROM bluff_meta WHERE key LIKE 'game_set:%'"); });

const post = (url: string, body: unknown) => new Request(`http://x${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const get = (qs = "") => today(new Request(`http://x/api/game/today${qs}`));
const truth = async (id: string) => (await t.pool.query("SELECT is_scam FROM game_cards WHERE id=$1", [id])).rows[0].is_scam as boolean;

describe("daily set", () => {
  it("5 cards, 2–3 scam, deterministic by date, differs across days, no answers leaked", async () => {
    const r = await (await get()).json();
    expect(r.cards).toHaveLength(5);
    expect(Object.keys(r.cards[0]).sort()).toEqual(["content", "id", "kind"]);
    const scam = await Promise.all(r.cards.map((c: { id: string }) => truth(c.id)));
    const n = scam.filter(Boolean).length;
    expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3);
    const again = await (await get()).json();
    expect(again.cards.map((c: { id: string }) => c.id)).toEqual(r.cards.map((c: { id: string }) => c.id));
    const pool = (await t.pool.query("SELECT id, kind, content, is_scam, red_flags, category, source FROM game_cards")).rows;
    expect(pickCards(pool, "2026-11-08").map((c) => c.id)).not.toEqual(pickCards(pool, "2026-11-09").map((c) => c.id));
    expect(pickCards(pool, "2026-11-08").map((c) => c.id)).toEqual(pickCards(pool, "2026-11-08").map((c) => c.id));
  });

  it("the set is fixed once opened, even if the pool changes later (across midnight)", async () => {
    const day = "2026-11-10";
    const first = (await cardsForDay(t.pool, day)).map((c) => c.id);
    await t.pool.query("INSERT INTO game_cards (kind, content, is_scam, red_flags, category, source) SELECT kind, content, is_scam, red_flags, category, 'seed' FROM game_cards LIMIT 5");
    expect((await cardsForDay(t.pool, day)).map((c) => c.id)).toEqual(first);
    await t.pool.query("DELETE FROM game_cards WHERE id NOT IN (SELECT id FROM game_cards ORDER BY id LIMIT 15)"); // best-effort cleanup
  });

  it("puzzle number, Chicago day key and bad dates", async () => {
    expect(puzzleNumber("2026-11-07")).toBe(1);
    expect(puzzleNumber("2026-11-09")).toBe(3);
    expect(dayKey(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-07"); // still the 7th in Chicago
    expect((await get("?d=garbage")).status).toBe(400);
    const future = await (await get("?d=2999-01-01")).json();
    expect(future.isToday).toBe(true); // future days fall back to today
  });
});

describe("answering and finishing", () => {
  it("answer reveals correctness, red-flag spans and category; unknown card is a 400", async () => {
    const card = (await t.pool.query("SELECT id FROM game_cards WHERE is_scam LIMIT 1")).rows[0];
    const ok = await (await answer(post("/api/game/answer", { cardId: card.id, guess: "scam" }))).json();
    expect(ok.correct).toBe(true);
    expect(ok.isScam).toBe(true);
    expect(ok.redFlags.length).toBeGreaterThan(0);
    const wrong = await (await answer(post("/api/game/answer", { cardId: card.id, guess: "legit" }))).json();
    expect(wrong.correct).toBe(false);
    expect((await answer(post("/api/game/answer", { cardId: "nope", guess: "scam" }))).status).toBe(400);
    expect((await answer(post("/api/game/answer", { cardId: "00000000-0000-4000-8000-0000000000aa", guess: "scam" }))).status).toBe(400);
  });

  it("perfect play: score 5/5, streak 1, share text hides answers; replay is practice and keeps the streak", async () => {
    const day = dayKey();
    const r = await (await get()).json();
    const answers = await Promise.all(r.cards.map(async (c: { id: string }) => ({ cardId: c.id, guess: (await truth(c.id)) ? "scam" : "legit" })));
    const res = await (await finish(post("/api/game/finish", { day, answers }))).json();
    expect(res).toMatchObject({ score: 5, streak: 1, weakest: null, practice: false });
    expect(res.shareText).toMatch(/^Call the Bluff #\d+ 🟩🟩🟩🟩🟩 5\/5 localhost:3000\/play$/);
    const replay = await (await finish(post("/api/game/finish", { day, answers: [] }))).json();
    expect(replay).toMatchObject({ score: 0, streak: 1, practice: true });
    expect((await (await get()).json()).alreadyPlayed.score).toBe(5);
  });

  it("score is computed on the server; weakest category = most misses; blank answers count as wrong", async () => {
    const day = dayKey();
    const r = await (await get()).json();
    const res = await (await finish(post("/api/game/finish", { day, answers: r.cards.slice(0, 2).map((c: { id: string }) => ({ cardId: c.id, guess: "scam" })) }))).json();
    expect(res.results).toHaveLength(5);
    expect(res.results.slice(2).every((x: boolean) => x === false)).toBe(true);
    expect(res.weakest).toBeTruthy();
    expect(res.shareText).toContain("🟥");
    expect(res.shareText).not.toMatch(/scam|legit/i);
  });

  it("streak increments across consecutive days and resets after a gap", async () => {
    const mk = async (day: string, now: string) => (await finishGame(t.pool, MAYA_ID, day, [], new Date(now)));
    expect((await mk("2026-11-07", "2026-11-07T18:00:00Z")).streak).toBe(1);
    expect((await mk("2026-11-08", "2026-11-08T18:00:00Z")).streak).toBe(2);
    expect((await mk("2026-11-09", "2026-11-09T18:00:00Z")).streak).toBe(3);
    expect((await mk("2026-11-12", "2026-11-12T18:00:00Z")).streak).toBe(1); // gap → reset
  });

  it("future days rejected; past days are practice only", async () => {
    await expect(finishGame(t.pool, MAYA_ID, "2999-01-01", [], new Date())).rejects.toThrow(/hasn't happened/);
    const past = await finishGame(t.pool, MAYA_ID, "2020-01-01", [], new Date("2026-11-07T18:00:00Z"));
    expect(past.practice).toBe(true);
  });

  it("share text host formatting", () => {
    expect(shareText(4, [false, true, true, false, true], 3, "example.com")).toBe("Call the Bluff #4 🟥🟩🟩🟥🟩 3/5 bluff.example.com/play");
  });
});
