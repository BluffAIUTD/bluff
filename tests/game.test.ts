import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, sessionCookie } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { GET as today } from "../app/api/game/today/route";
import { POST as answer } from "../app/api/game/answer/route";
import { POST as finish } from "../app/api/game/finish/route";
import { addDays, answerCard, cardsForDay, dayKey, finishGame, gameStats, LADDER, nextPuzzleAt, pickDaily, puzzleNumber, shareText, type CardRow } from "../lib/game";
import { ensureBankCard } from "../lib/bankcard";
import { seedMessageDataset } from "../scripts/seed/seed";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_game_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  await t.pool.query("DELETE FROM game_plays");
  await t.pool.query("DELETE FROM bluff_meta WHERE key LIKE 'game_set:%'");
  await t.pool.query("DELETE FROM game_cards WHERE source IN ('bank','generated','lookalike')");
});

const USER_A = "00000000-0000-4000-8000-0000000000a1";
const USER_B = "00000000-0000-4000-8000-0000000000b1";
const COLS = "id, kind, content, is_scam, red_flags, category, source, origin, difficulty, why_legit, user_id";
const post = (url: string, body: unknown, user = MAYA_ID) => new Request(`http://x${url}`, { method: "POST", headers: { "content-type": "application/json", ...sessionCookie(user) }, body: JSON.stringify(body) });
const get = (qs = "", user = MAYA_ID) => today(new Request(`http://x/api/game/today${qs}`, { headers: sessionCookie(user) }));
const card = async (id: string) => (await t.pool.query(`SELECT ${COLS} FROM game_cards WHERE id=$1`, [id])).rows[0] as CardRow;
const pool = async () => (await t.pool.query(`SELECT ${COLS} FROM game_cards WHERE user_id IS NULL AND day IS NULL`)).rows as CardRow[];
const truth = (c: CardRow) => (c.is_scam ? "scam" : "legit") as "scam" | "legit";
/** One word inside the card's first red-flag span. */
const flagTap = (c: CardRow) => {
  const f = c.red_flags.find((x) => c.content.body.includes(x.span))!;
  const i = c.content.body.indexOf(f.span);
  return { start: i, end: i + f.span.split(/\s/)[0].length };
};
/** A word that overlaps no red-flag span. */
const plainTap = (c: CardRow) => {
  const spans = c.red_flags.map((f) => { const i = c.content.body.indexOf(f.span); return [i, i + f.span.length]; });
  for (const m of c.content.body.matchAll(/\S+/g)) {
    const [s, e] = [m.index!, m.index! + m[0].length];
    if (!spans.some(([a, b]) => s < b && e > a)) return { start: s, end: e };
  }
  throw new Error("no plain word");
};
const noonCst = (day: string) => new Date(`${day}T18:00:00Z`);
/** Play a whole day correctly as `user`, at noon Chicago time on that day. */
async function playDay(user: string, day: string, upTo = 5) {
  const set = await cardsForDay(t.pool, day);
  let last;
  for (const c of set.slice(0, upTo)) last = await answerCard(t.pool, user, { cardId: c.id, guess: truth(c), day }, noonCst(day));
  return last!;
}

describe("daily set", () => {
  it("5 cards on the easy-medium-medium-hard-hard ladder, 2–3 scams, distinct categories; nothing leaks before the guess", async () => {
    const r = await (await get()).json();
    expect(r.cards).toHaveLength(5);
    expect(Object.keys(r.cards[0]).sort()).toEqual(["content", "difficulty", "id", "kind"]);
    expect(r.cards.map((c: { difficulty: string }) => c.difficulty)).toEqual([...LADDER]);
    const rows = await Promise.all(r.cards.map((c: { id: string }) => card(c.id)));
    const n = rows.filter((c) => c.is_scam).length;
    expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3);
    expect(new Set(rows.map((c) => c.category)).size).toBe(5);
    expect(rows.every((c) => c.source !== "bank" && !c.user_id)).toBe(true);
    const again = await (await get()).json();
    expect(again.cards.map((c: { id: string }) => c.id)).toEqual(r.cards.map((c: { id: string }) => c.id));
    expect(r).toMatchObject({ isToday: true, practice: false, progress: [], done: null, bonus: null });
  });

  it("pickDaily: deterministic per day, varies by day, and holds its rules across a month", async () => {
    const p = await pool();
    const ids = (d: string) => pickDaily(p, d).map((c) => c.id);
    expect(ids("2026-11-08")).toEqual(ids("2026-11-08"));
    expect(ids("2026-11-08")).not.toEqual(ids("2026-11-09"));
    const scamCounts = new Set<number>();
    for (let k = 0; k < 30; k++) {
      const set = pickDaily(p, addDays("2026-11-07", k));
      expect(set.map((c) => c.difficulty)).toEqual([...LADDER]);
      expect(new Set(set.map((c) => c.category)).size).toBe(5);
      const n = set.filter((c) => c.is_scam).length;
      expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3);
      scamCounts.add(n);
    }
    expect([...scamCounts].sort()).toEqual([2, 3]);
  });

  it("pickDaily: the day's Nemotron lookalike takes a hard scam slot, a generated card a medium slot; bank cards never appear", async () => {
    const p = await pool();
    const mk = (id: string, source: string, is_scam: boolean, extra: Partial<CardRow> = {}): CardRow => ({ id, kind: "text", content: { body: id }, is_scam, red_flags: [], category: `cat-${id}`, source, origin: null, difficulty: "medium", ...extra });
    const extra = [
      mk("ffffffff-0000-4000-8000-000000000001", "lookalike", true, { difficulty: "hard" }),
      mk("ffffffff-0000-4000-8000-000000000002", "generated", true),
      mk("ffffffff-0000-4000-8000-000000000003", "generated", false),
      mk("ffffffff-0000-4000-8000-000000000004", "bank", true, { user_id: USER_A }),
      mk("ffffffff-0000-4000-8000-000000000005", "bank", false),
    ];
    for (let k = 0; k < 20; k++) {
      const set = pickDaily([...p, ...extra], addDays("2026-11-07", k));
      const look = set.findIndex((c) => c.source === "lookalike");
      expect([3, 4]).toContain(look);
      expect(set.filter((c) => c.source === "generated").map((c) => set.indexOf(c)).every((i) => i === 1 || i === 2)).toBe(true);
      expect(set.some((c) => c.source === "generated")).toBe(true);
      expect(set.some((c) => c.source === "bank")).toBe(false);
      const n = set.filter((c) => c.is_scam).length;
      expect(n).toBeGreaterThanOrEqual(2); expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("the set is fixed once opened, even if the pool changes later (across midnight)", async () => {
    const day = "2026-11-10";
    const first = (await cardsForDay(t.pool, day)).map((c) => c.id);
    await t.pool.query("INSERT INTO game_cards (kind, content, is_scam, red_flags, category, source) SELECT kind, content, is_scam, red_flags, category || '_x', 'seed' FROM game_cards WHERE source='seed' LIMIT 5");
    expect((await cardsForDay(t.pool, day)).map((c) => c.id)).toEqual(first);
    await t.pool.query("DELETE FROM game_cards WHERE source='seed' AND origin IS NULL");
  });

  it("Nemotron cards that arrive before anyone has played get into the set; once a game starts the set stays fixed", async () => {
    const day = "2026-11-20";
    const first = await cardsForDay(t.pool, day);
    expect(first.some((c) => c.source === "lookalike")).toBe(false);
    await t.pool.query("INSERT INTO game_cards (day, kind, content, is_scam, red_flags, category, source, difficulty) VALUES ($1,'text',$2,true,$3,'toll_scam_look','lookalike','hard')",
      [day, JSON.stringify({ body: "Zorbly Tolls: final notice, pay within 6 hrs" }), JSON.stringify([{ span: "within 6 hrs", why: "deadline" }])]);
    const rebuilt = await cardsForDay(t.pool, day);
    expect(rebuilt.some((c) => c.source === "lookalike")).toBe(true);
    await answerCard(t.pool, MAYA_ID, { cardId: rebuilt[0].id, guess: "legit", day }, noonCst(day));
    await t.pool.query("INSERT INTO game_cards (day, kind, content, is_scam, red_flags, category, source) VALUES ($1,'text',$2,false,'[]','legit_x','generated')", [day, JSON.stringify({ body: "Maple Dental: see you at 3" })]);
    expect((await cardsForDay(t.pool, day)).map((c) => c.id)).toEqual(rebuilt.map((c) => c.id));
  });

  it("puzzle number, Chicago day key and bad dates", async () => {
    expect(puzzleNumber("2026-11-07")).toBe(1);
    expect(puzzleNumber("2026-11-09")).toBe(3);
    expect(dayKey(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-07"); // still the 7th in Chicago
    expect((await get("?d=garbage")).status).toBe(400);
    const future = await (await get("?d=2999-01-01")).json();
    expect(future.isToday).toBe(true); // future days fall back to today
  });

  it("next puzzle = the next Chicago midnight, across both DST changes", () => {
    expect(nextPuzzleAt(new Date("2026-10-31T12:00:00Z"))).toBe("2026-11-01T05:00:00.000Z"); // CDT
    expect(nextPuzzleAt(new Date("2026-11-01T05:30:00Z"))).toBe("2026-11-02T06:00:00.000Z"); // the 25-hour day DST ends
    expect(nextPuzzleAt(new Date("2026-11-08T03:30:00Z"))).toBe("2026-11-08T06:00:00.000Z"); // CST, late evening
    expect(nextPuzzleAt(new Date("2027-03-13T18:00:00Z"))).toBe("2027-03-14T06:00:00.000Z"); // midnight before DST starts is still CST
    expect(nextPuzzleAt(new Date("2027-03-14T18:00:00Z"))).toBe("2027-03-15T05:00:00.000Z"); // the 23-hour day DST starts
  });
});

describe("answering", () => {
  it("the first answer locks; a second guess is ignored; unknown or foreign cards are a 400", async () => {
    const r = await (await get()).json();
    const c0 = r.cards[0];
    const a1 = await (await answer(post("/api/game/answer", { cardId: c0.id, guess: "scam" }))).json();
    const a2 = await (await answer(post("/api/game/answer", { cardId: c0.id, guess: "legit" }))).json();
    expect(a1).toMatchObject({ cardId: c0.id, guess: "scam" });
    expect(a2).toMatchObject({ guess: "scam", correct: a1.correct, isScam: a1.isScam });
    expect(a1.source).toBeTruthy();
    const stored = (await t.pool.query("SELECT answers, finished_at FROM game_plays WHERE user_id=$1 AND NOT practice", [MAYA_ID])).rows[0];
    expect(stored.answers).toHaveLength(1);
    expect(stored.finished_at).toBeNull();
    expect((await answer(post("/api/game/answer", { cardId: "nope", guess: "scam" }))).status).toBe(400);
    expect((await answer(post("/api/game/answer", { cardId: "00000000-0000-4000-8000-0000000000aa", guess: "scam" }))).status).toBe(400);
    const outside = (await t.pool.query("SELECT id FROM game_cards WHERE NOT (id = ANY($1::uuid[])) LIMIT 1", [r.cards.map((c: { id: string }) => c.id)])).rows[0].id;
    expect((await answer(post("/api/game/answer", { cardId: outside, guess: "scam" }))).status).toBe(400);
  });

  it("giveaways: a tapped red-flag word counts, another word doesn't, and a multi-word tap is refused without locking", async () => {
    const r = await (await get()).json();
    const rows = await Promise.all(r.cards.map((c: { id: string }) => card(c.id)));
    const [s1, s2] = rows.filter((c) => c.is_scam);
    const hit = await (await answer(post("/api/game/answer", { cardId: s1.id, guess: "scam", tap: flagTap(s1) }))).json();
    expect(hit).toMatchObject({ correct: true, giveaway: true, tap: flagTap(s1) });
    const bad = await answer(post("/api/game/answer", { cardId: s2.id, guess: "scam", tap: { start: 0, end: Math.min(60, s2.content.body.length) } }));
    expect(bad.status).toBe(400);
    const miss = await (await answer(post("/api/game/answer", { cardId: s2.id, guess: "scam", tap: plainTap(s2) }))).json();
    expect(miss).toMatchObject({ correct: true, giveaway: false });
    const legit = rows.find((c) => !c.is_scam)!;
    const wrong = await (await answer(post("/api/game/answer", { cardId: legit.id, guess: "scam", tap: { start: 0, end: 1 } }))).json();
    expect(wrong).toMatchObject({ correct: false, giveaway: false, isScam: false });
    expect(wrong.redFlags).toEqual([]);
    expect("whyLegit" in wrong).toBe(true);
  });

  it("resume: progress is stored; a reload returns the locked answers in set order and no finished board", async () => {
    const r = await (await get()).json();
    await answer(post("/api/game/answer", { cardId: r.cards[2].id, guess: "legit" }));
    await answer(post("/api/game/answer", { cardId: r.cards[0].id, guess: "scam" }));
    const back = await (await get()).json();
    expect(back.progress.map((p: { cardId: string }) => p.cardId)).toEqual([r.cards[0].id, r.cards[2].id]);
    expect(back.progress.map((p: { guess: string }) => p.guess)).toEqual(["scam", "legit"]);
    expect(back.done).toBeNull();
    expect(back.stats.played).toBe(0);
  });

  it("perfect play: the last answer finishes the game; 5/5, streak 1, giveaways, spoiler-free share text; no replay", async () => {
    const r = await (await get()).json();
    const rows: CardRow[] = await Promise.all(r.cards.map((c: { id: string }) => card(c.id)));
    let last;
    for (const c of rows) last = await (await answer(post("/api/game/answer", { cardId: c.id, guess: truth(c), tap: c.is_scam ? flagTap(c) : null }))).json();
    expect(last.done).toMatchObject({ score: 5, streak: 1, practice: false });
    const state = await (await finish(post("/api/game/finish", { day: r.day }))).json();
    const nScam = rows.filter((c) => c.is_scam).length;
    expect(state.done).toMatchObject({ score: 5, streak: 1, weakest: null, practice: false, giveaways: nScam, results: [true, true, true, true, true] });
    expect(state.done.shareText).toBe(`Call the Bluff #${r.n} · 5/5 · 🔥1\n🟩🟩🟩🟩🟩\n🔍 ${nScam} giveaways spotted\nlocalhost:3000/play`);
    expect(state.done.shareText).not.toMatch(/scam|legit/i);
    expect(state.stats).toMatchObject({ played: 1, winPct: 100, perfectPct: 100, currentStreak: 1, maxStreak: 1, dist: [0, 0, 0, 0, 0, 1] });
    expect(state.bonus).toEqual({ status: "locked" }); // no bank scan yet
    // Today can't be replayed: answers stay locked and finishing again returns the same board.
    const again = await (await answer(post("/api/game/answer", { cardId: rows[0].id, guess: rows[0].is_scam ? "legit" : "scam" }))).json();
    expect(again.correct).toBe(true);
    const reload = await (await get()).json();
    expect(reload.done.shareText).toBe(state.done.shareText);
    expect(reload.progress).toHaveLength(5);
    expect((await (await finish(post("/api/game/finish", { day: r.day }))).json()).done.score).toBe(5);
  });

  it("today is scored from the locked answers only: finishing early is refused and body answers are ignored", async () => {
    const r = await (await get()).json();
    const rows: CardRow[] = await Promise.all(r.cards.map((c: { id: string }) => card(c.id)));
    await answer(post("/api/game/answer", { cardId: rows[0].id, guess: rows[0].is_scam ? "legit" : "scam" })); // wrong on purpose
    const early = await finish(post("/api/game/finish", { day: r.day, answers: rows.map((c) => ({ cardId: c.id, guess: truth(c) })) }));
    expect(early.status).toBe(400);
    for (const c of rows.slice(1)) await answer(post("/api/game/answer", { cardId: c.id, guess: truth(c) }));
    const state = await (await finish(post("/api/game/finish", { day: r.day, answers: rows.map((c) => ({ cardId: c.id, guess: truth(c) })) }))).json();
    expect(state.done.score).toBe(4);
    expect(state.done.results[0]).toBe(false);
    expect(state.done.weakest).toBe(rows[0].category);
  });

  it("streak counts consecutive finished days, not abandoned ones; it resets after a gap and the max is kept", async () => {
    expect((await playDay(MAYA_ID, "2026-11-07")).done?.streak).toBe(1);
    expect((await playDay(MAYA_ID, "2026-11-08")).done?.streak).toBe(2);
    expect((await playDay(MAYA_ID, "2026-11-09")).done?.streak).toBe(3);
    expect((await playDay(MAYA_ID, "2026-11-10", 2)).done).toBeNull(); // abandoned after 2 cards
    expect((await playDay(MAYA_ID, "2026-11-12")).done?.streak).toBe(1);
    const s = await gameStats(t.pool, MAYA_ID, "2026-11-12");
    expect(s).toMatchObject({ played: 4, currentStreak: 1, maxStreak: 3 });
    expect((await gameStats(t.pool, MAYA_ID, "2026-11-14")).currentStreak).toBe(0);
  });

  it("a game started before midnight can still be finished just after it, and counts for that day", async () => {
    const day = "2026-11-15";
    const set = await cardsForDay(t.pool, day);
    for (const c of set.slice(0, 3)) await answerCard(t.pool, MAYA_ID, { cardId: c.id, guess: truth(c), day }, new Date("2026-11-16T05:50:00Z")); // 11:50 PM
    let last;
    for (const c of set.slice(3)) last = await answerCard(t.pool, MAYA_ID, { cardId: c.id, guess: truth(c), day }, new Date("2026-11-16T06:10:00Z")); // 12:10 AM
    expect(last!.done).toMatchObject({ score: 5, practice: false, streak: 1 });
  });

  it("stats: played, win %, perfect %, histogram; in-progress and practice rows don't count", async () => {
    const rows: [string, number, number][] = [["2026-11-01", 5, 1], ["2026-11-02", 4, 2], ["2026-11-03", 3, 3], ["2026-11-04", 5, 4], ["2026-11-06", 0, 1]];
    for (const [day, score, streak] of rows) await t.pool.query("INSERT INTO game_plays (user_id, day, score, streak) VALUES ($1,$2,$3,$4)", [MAYA_ID, day, score, streak]);
    await t.pool.query("INSERT INTO game_plays (user_id, day, score, streak, finished_at) VALUES ($1,'2026-11-07',5,2,NULL)", [MAYA_ID]);
    await t.pool.query("INSERT INTO game_plays (user_id, day, score, streak, practice) VALUES ($1,'2026-11-05',5,0,true)", [MAYA_ID]);
    const s = await gameStats(t.pool, MAYA_ID, "2026-11-07");
    expect(s).toEqual({ played: 5, winPct: 60, perfectPct: 40, currentStreak: 1, maxStreak: 4, dist: [1, 0, 0, 1, 1, 2] });
  });

  it("past days are unscored practice: nothing is stored or locked, the finish is practice and stats don't move", async () => {
    const past = addDays(dayKey(), -3);
    const r = await (await get(`?d=${past}`)).json();
    expect(r).toMatchObject({ day: past, isToday: false, practice: true, done: null });
    const c0 = await card(r.cards[0].id);
    const a = await (await answer(post("/api/game/answer", { cardId: c0.id, guess: "scam", day: past }))).json();
    const b = await (await answer(post("/api/game/answer", { cardId: c0.id, guess: "legit", day: past }))).json();
    expect(a.correct).not.toBe(b.correct);
    expect(Number((await t.pool.query("SELECT count(*) n FROM game_plays")).rows[0].n)).toBe(0);
    const state = await (await finish(post("/api/game/finish", { day: past, answers: [{ cardId: c0.id, guess: truth(c0) }] }))).json();
    expect(state.done).toMatchObject({ practice: true, score: 1, results: [true, false, false, false, false] });
    expect(state.done.shareText).toMatch(/^Call the Bluff #\d+ \(practice\) · 1\/5\n/u);
    expect(state.progress).toHaveLength(1);
    expect(state.stats.played).toBe(0);
    expect(state.bonus).toBeNull();
    await expect(finishGame(t.pool, MAYA_ID, "2999-01-01", [], new Date())).rejects.toThrow(/hasn't happened/);
  });

  it("share text: multi-line, no labels, giveaways without a denominator, the app's own host", () => {
    expect(shareText({ n: 2, results: [true, true, false, true, true], streak: 3, giveaways: 2 }, "bluffai.us"))
      .toBe("Call the Bluff #2 · 4/5 · 🔥3\n🟩🟩🟥🟩🟩\n🔍 2 giveaways spotted\nbluffai.us/play");
    expect(shareText({ n: 4, results: [false, true, true, false, true], streak: 1, giveaways: 1 }, "bluffai.us"))
      .toBe("Call the Bluff #4 · 3/5 · 🔥1\n🟥🟩🟩🟥🟩\n🔍 1 giveaway spotted\nbluffai.us/play");
    expect(shareText({ n: 4, results: [false, false, false, false, false], streak: 0, giveaways: 0, practice: true }, "bluffai.us"))
      .toBe("Call the Bluff #4 (practice) · 0/5\n🟥🟥🟥🟥🟥\nbluffai.us/play");
    const prev = process.env.BASE_DOMAIN;
    process.env.BASE_DOMAIN = "bluffai.us";
    expect(shareText({ n: 1, results: [true, true, true, true, true], streak: 1, giveaways: 0 })).toBe("Call the Bluff #1 · 5/5 · 🔥1\n🟩🟩🟩🟩🟩\nbluffai.us/play");
    if (prev === undefined) delete process.env.BASE_DOMAIN; else process.env.BASE_DOMAIN = prev;
  });
});

describe("bank-scan bonus card", () => {
  const scanFor = async (user: string, host: string) => {
    await t.pool.query("INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, website, source) VALUES (now() - interval '1 day', $1, 'SHADYKICKS*ORDER', 'shadykicks order', 8999, $2, 'nessie')", [user, host]);
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'site',$2,$3,'live')", [user, host,
      JSON.stringify({ verdict: "likely_scam", confidence: 0.9, score: 12, category: "fake_store", evidence: ["Domain registered 4 days ago", "Gift-card-only checkout", "No refund policy"] })]);
  };

  it("belongs to one user: never in the shared set, invisible to others, unscored for its owner", async () => {
    await get("", USER_A); await get("", USER_B); // provision both accounts
    await scanFor(USER_A, "shady-kicks.example");
    const day = dayKey();
    const id = await ensureBankCard(t.pool, USER_A, day);
    expect(id).toBeTruthy();
    expect(await ensureBankCard(t.pool, USER_A, day)).toBe(id); // one per user per day
    expect((await card(id!)).user_id).toBe(USER_A);
    expect(await ensureBankCard(t.pool, USER_B, day)).toBeNull();
    expect((await cardsForDay(t.pool, day)).some((c) => c.id === id)).toBe(false);

    // B can't see or answer A's card; A can, as often as they like, without it touching today's game.
    expect((await answer(post("/api/game/answer", { cardId: id, guess: "scam" }, USER_B))).status).toBe(400);
    const own = await (await answer(post("/api/game/answer", { cardId: id, guess: "scam" }, USER_A))).json();
    expect(own).toMatchObject({ correct: true, isScam: true, source: "bank" });
    expect((await (await answer(post("/api/game/answer", { cardId: id, guess: "legit" }, USER_A))).json()).correct).toBe(false);
    expect(Number((await t.pool.query("SELECT count(*) n FROM game_plays WHERE user_id=$1", [USER_A])).rows[0].n)).toBe(0);

    // After the daily five: A gets the bonus card, B gets the nudge to scan.
    expect((await (await get("", USER_A)).json()).bonus).toBeNull(); // not before finishing
    for (const user of [USER_A, USER_B]) await playDay(user, day);
    const a = await (await get("", USER_A)).json();
    const b = await (await get("", USER_B)).json();
    expect(a.bonus).toMatchObject({ status: "ready", card: { id } });
    expect(Object.keys(a.bonus.card).sort()).toEqual(["content", "difficulty", "id", "kind"]);
    expect(b.bonus).toEqual({ status: "locked" });
    expect(JSON.stringify(b)).not.toContain("shady-kicks");
    expect(a.cards.map((c: { id: string }) => c.id)).toEqual(b.cards.map((c: { id: string }) => c.id));
  });
});

describe("message dataset reseed", () => {
  it("updates cards in place (ids stable) with difficulty and why_legit; seed cards keep their ids too", async () => {
    const snap = async () => new Map((await t.pool.query("SELECT origin, id FROM game_cards WHERE source IN ('dataset','seed')")).rows.map((r) => [r.origin as string, r.id as string]));
    const before = await snap();
    expect(before.size).toBeGreaterThanOrEqual(315);
    await seedMessageDataset(t.pool);
    expect(await snap()).toEqual(before);
    const diff = (await t.pool.query("SELECT difficulty, count(*)::int n FROM game_cards WHERE source='dataset' GROUP BY 1 ORDER BY 1")).rows;
    expect(diff.map((r) => r.difficulty)).toEqual(["easy", "hard", "medium"]);
    const legit = (await t.pool.query("SELECT count(*)::int n, count(why_legit)::int w FROM game_cards WHERE source='dataset' AND NOT is_scam")).rows[0];
    expect(legit.w).toBeGreaterThan(100);
    expect(Number((await t.pool.query("SELECT count(*) n FROM game_cards WHERE source='dataset' AND is_scam AND why_legit IS NOT NULL")).rows[0].n)).toBe(0);
  });
});
