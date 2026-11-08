import type { Db } from "./db";
import { many, one } from "./db";
import { appHost } from "./config";
import { ApiError } from "./errors";
import type { GameTap } from "./schemas";
import { ensureBankCard } from "./bankcard";

/**
 * Call the Bluff, a Wordle-style daily. Everyone gets the same 5 messages in the same order (America/Chicago day,
 * frozen in bluff_meta game_set:<day>). One call per card, locked on the server the first time; after "Bluff!" the
 * player may tap the word that gave it away. Past days are unscored practice; the bank-scan bonus card is per user.
 */
export const GAME_START = "2026-11-07";
const DAY_MS = 86_400_000;
export const CARDS_PER_DAY = 5;
export const LADDER = ["easy", "medium", "medium", "hard", "hard"] as const;
export type Difficulty = (typeof LADDER)[number];
export type Guess = "legit" | "scam";
type Flag = { span: string; why: string };
type Content = { from?: string; subject?: string; body: string };

/** What the player sees before answering: no label, source, origin or category. */
export type CardPublic = { id: string; kind: string; content: Content; difficulty: Difficulty };
export type CardRow = {
  id: string; kind: string; content: Content; is_scam: boolean; red_flags: Flag[]; category: string; source: string;
  origin: string | null; difficulty?: Difficulty | null; why_legit?: string | null; user_id?: string | null;
};
const COLS = "id, kind, content, is_scam, red_flags, category, source, origin, difficulty, why_legit";

export type Reveal = {
  cardId: string; guess: Guess; correct: boolean; isScam: boolean; redFlags: Flag[]; category: string; whyLegit: string | null;
  source: string; origin: string | null; tap: GameTap | null;
  /** A correct "Bluff!" whose tapped word overlaps one of the card's red-flag spans. */
  giveaway: boolean;
};
export type FinishResult = { day: string; score: number; giveaways: number; streak: number; weakest: string | null; shareText: string; practice: boolean; results: boolean[] };
export type Stats = { played: number; winPct: number; perfectPct: number; currentStreak: number; maxStreak: number; dist: number[] };
export type Bonus = { status: "ready"; card: CardPublic } | { status: "locked" };
export type ArchiveDay = { day: string; n: number; score: number | null };
export type GameState = {
  day: string; n: number; isToday: boolean;
  /** A past day the player did not play: answers are checked but never stored, and nothing counts. */
  practice: boolean;
  cards: CardPublic[];
  /** Locked answers so far, in set order (or the practice answers just submitted). */
  progress: Reveal[];
  done: FinishResult | null;
  stats: Stats; streak: number;
  nextAt: string; serverNow: string;
  bonus: Bonus | null;
  archive: ArchiveDay[];
};
type StoredAnswer = { cardId: string; guess: Guess; tap?: GameTap | null };
type PlayRow = { answers: StoredAnswer[]; finished: boolean; streak: number };

// ---- days ------------------------------------------------------------------------------------------------------------
const CHICAGO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" });

/** Calendar day in America/Chicago as YYYY-MM-DD (UTC stored, Chicago displayed). */
export function dayKey(now = new Date()): string {
  return CHICAGO.format(now);
}

export const addDays = (day: string, n: number) => new Date(Date.parse(day) + n * DAY_MS).toISOString().slice(0, 10);

export function puzzleNumber(day: string): number {
  return Math.max(1, Math.round((Date.parse(day) - Date.parse(GAME_START)) / DAY_MS) + 1);
}

/** The instant the next Chicago day starts (ISO). Chicago is UTC-5 or UTC-6; DST switches at 2 AM, never at midnight. */
export function nextPuzzleAt(now = new Date()): string {
  const today = dayKey(now), next = addDays(today, 1);
  const base = Date.parse(`${next}T00:00:00Z`);
  for (const h of [5, 6, 4, 7]) {
    const t = base + h * 3_600_000;
    if (dayKey(new Date(t)) === next && dayKey(new Date(t - 1000)) === today) return new Date(t).toISOString();
  }
  let t = now.getTime();
  while (dayKey(new Date(t)) === today) t += 60_000;
  return new Date(t).toISOString();
}

// ---- the daily set ---------------------------------------------------------------------------------------------------
function fnv1a(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rng(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle<T>(arr: T[], r: () => number): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/**
 * Pure, deterministic per day: 5 cards on the ladder easy, medium, medium, hard, hard with 2-3 scams at random
 * positions and no category twice. The day's Nemotron lookalike takes a hard scam slot and one Nemotron-generated card a
 * medium slot, so generated cards really appear. Bank-scan cards (per user) are never in the shared set.
 */
export function pickDaily(pool: CardRow[], day: string): CardRow[] {
  const r = rng(fnv1a(`daily:${day}`));
  const order = shuffle(pool.filter((c) => c.source !== "bank" && !c.user_id).sort((a, b) => a.id.localeCompare(b.id)), r);
  const scamSlots = new Set(shuffle([0, 1, 2, 3, 4], r).slice(0, 2 + Math.floor(r() * 2)));
  const reserved = new Map<number, CardRow>();
  const look = order.find((c) => c.source === "lookalike" && c.is_scam);
  if (look) {
    let slot = [3, 4].find((i) => scamSlots.has(i));
    if (slot === undefined) {
      scamSlots.delete(Math.min(...scamSlots));
      slot = 3 + Math.floor(r() * 2);
      scamSlots.add(slot);
    }
    reserved.set(slot, look);
  }
  const gen = order.find((c) => c.source === "generated" && c.category !== look?.category && [1, 2].some((i) => scamSlots.has(i) === c.is_scam));
  if (gen) reserved.set([1, 2].find((i) => scamSlots.has(i) === gen.is_scam)!, gen);

  const used = new Set([...reserved.values()].map((c) => c.id));
  const cats = new Set([...reserved.values()].map((c) => c.category));
  const out: CardRow[] = [];
  LADDER.forEach((diff, i) => {
    const want = scamSlots.has(i);
    const tiers: ((c: CardRow) => boolean)[] = [
      (c) => c.is_scam === want && (c.difficulty ?? "medium") === diff && !cats.has(c.category),
      (c) => c.is_scam === want && !cats.has(c.category),
      (c) => c.is_scam === want,
      () => true,
    ];
    const pick = reserved.get(i) ?? tiers.map((ok) => order.find((c) => !used.has(c.id) && ok(c))).find((c) => !!c);
    if (!pick) return;
    out.push(pick);
    used.add(pick.id);
    cats.add(pick.category);
  });
  return out;
}

async function loadSet(db: Db, day: string): Promise<{ raw: string; cards: CardRow[] | null } | null> {
  const meta = await one<{ value: string }>(db, "SELECT value FROM bluff_meta WHERE key=$1", [`game_set:${day}`]);
  if (!meta) return null;
  const ids = JSON.parse(meta.value) as string[];
  const rows = await many<CardRow>(db, `SELECT ${COLS} FROM game_cards WHERE id = ANY($1::uuid[])`, [ids]);
  const byId = new Map(rows.map((c) => [c.id, c]));
  const ordered = ids.map((i) => byId.get(i)).filter((c): c is CardRow => !!c);
  return { raw: meta.value, cards: ordered.length === ids.length ? ordered : null };
}

/**
 * The day's set is frozen the first time it is opened. It is rebuilt only when cards were deleted (e.g. a reseed), or,
 * while nobody has started that day, when Nemotron cards for the day arrived after it was frozen.
 */
export async function cardsForDay(db: Db, day: string): Promise<CardRow[]> {
  const frozen = await loadSet(db, day);
  if (frozen?.cards) {
    const newer = await one<{ newer: boolean }>(db,
      `SELECT NOT EXISTS (SELECT 1 FROM game_plays WHERE day=$1)
          AND EXISTS (SELECT 1 FROM game_cards WHERE day=$1 AND user_id IS NULL AND source IN ('generated','lookalike') AND NOT (id = ANY($2::uuid[]))) AS newer`,
      [day, frozen.cards.map((c) => c.id)]);
    if (!newer?.newer) return frozen.cards;
  }
  const pool = await many<CardRow>(db, `SELECT ${COLS} FROM game_cards WHERE (day IS NULL OR day = $1) AND user_id IS NULL AND source <> 'bank'`, [day]);
  if (pool.length < CARDS_PER_DAY) throw new ApiError("upstream_down", "The card pool is empty. Seed the database.");
  const picks = pickDaily(pool, day);
  const value = JSON.stringify(picks.map((c) => c.id));
  if (frozen) await db.query("UPDATE bluff_meta SET value=$2 WHERE key=$1 AND value=$3", [`game_set:${day}`, value, frozen.raw]);
  else await db.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING", [`game_set:${day}`, value]);
  return (await loadSet(db, day))?.cards ?? picks; // a concurrent request may have frozen it first
}

export const toPublic = (c: CardRow): CardPublic => ({ id: c.id, kind: c.kind, content: c.content, difficulty: c.difficulty ?? "medium" });

// ---- answers -----------------------------------------------------------------------------------------------------------
/** A tap must be one word inside the body (no whitespace), so tapping the whole message can't game the giveaway. */
function tapIsValid(c: CardRow, tap: GameTap): boolean {
  const body = c.content.body;
  return tap.end <= body.length && tap.end > tap.start && !/\s/.test(body.slice(tap.start, tap.end));
}

function tapHitsFlag(c: CardRow, tap: GameTap | null): boolean {
  if (!tap) return false;
  const body = c.content.body;
  return c.red_flags.some((f) => {
    const i = f.span ? body.indexOf(f.span) : -1;
    return i >= 0 && tap.start < i + f.span.length && tap.end > i;
  });
}

export function revealCard(c: CardRow, guess: Guess, tap: GameTap | null): Reveal {
  const t = guess === "scam" && tap && tapIsValid(c, tap) ? { start: tap.start, end: tap.end } : null;
  const correct = (guess === "scam") === c.is_scam;
  return {
    cardId: c.id, guess, correct, isScam: c.is_scam, redFlags: c.red_flags, category: c.category,
    whyLegit: c.is_scam ? null : c.why_legit ?? null, source: c.source, origin: c.origin ?? null, tap: t,
    giveaway: correct && c.is_scam && tapHitsFlag(c, t),
  };
}

const revealsFor = (set: CardRow[], answers: StoredAnswer[]): Reveal[] => {
  const by = new Map(answers.map((a) => [a.cardId, a]));
  return set.flatMap((c) => { const a = by.get(c.id); return a ? [revealCard(c, a.guess, a.tap ?? null)] : []; });
};

async function playRow(db: Db, userId: string, day: string): Promise<PlayRow | null> {
  return one<PlayRow>(db, "SELECT answers, finished_at IS NOT NULL AS finished, streak FROM game_plays WHERE user_id=$1 AND day=$2 AND NOT practice", [userId, day]);
}

/** Today, or yesterday's game when it was started before midnight and is still open. */
const isLive = (day: string, today: string, row: PlayRow | null) => day === today || (!!row && !row.finished && day === addDays(today, -1));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check one call. For the daily puzzle the FIRST answer per card is stored and every later call returns that locked
 * answer; answering the last card finishes the game. Past days (practice) and the user's own bonus card are stateless.
 */
export async function answerCard(db: Db, userId: string, input: { cardId: string; guess: Guess; tap?: GameTap | null; day?: string }, now = new Date()): Promise<Reveal & { done: FinishResult | null }> {
  if (!UUID.test(input.cardId)) throw new ApiError("bad_input", "Unknown card");
  const today = dayKey(now);
  const day = input.day ?? today;
  if (day > today) throw new ApiError("bad_input", "That day hasn't happened yet");
  const set = await cardsForDay(db, day);
  const card = set.find((c) => c.id === input.cardId);
  const tap = input.guess === "scam" ? input.tap ?? null : null;
  if (!card) {
    const own = await one<CardRow>(db, `SELECT ${COLS} FROM game_cards WHERE id=$1 AND source='bank' AND user_id=$2`, [input.cardId, userId]);
    if (!own) throw new ApiError("bad_input", "That card isn't in this puzzle");
    return { ...revealCard(own, input.guess, null), done: null };
  }
  if (tap && !tapIsValid(card, tap)) throw new ApiError("bad_input", "Tap a single word of the message");
  let row = await playRow(db, userId, day);
  if (!isLive(day, today, row) && !row?.finished) return { ...revealCard(card, input.guess, tap), done: null };

  if (!row) await db.query("INSERT INTO game_plays (user_id, day, answers, score, streak, practice, finished_at) VALUES ($1,$2,'[]',0,0,false,NULL) ON CONFLICT DO NOTHING", [userId, day]);
  await db.query(
    `UPDATE game_plays SET answers = answers || $3::jsonb
      WHERE user_id=$1 AND day=$2 AND NOT practice AND finished_at IS NULL AND NOT answers @> $4::jsonb`,
    [userId, day, JSON.stringify([{ cardId: card.id, guess: input.guess, tap }]), JSON.stringify([{ cardId: card.id }])]);
  row = await playRow(db, userId, day);
  const locked = row?.answers.find((a) => a.cardId === card.id);
  if (!row || !locked) throw new ApiError("conflict", "This puzzle is already finished.");
  const complete = set.every((c) => row!.answers.some((a) => a.cardId === c.id));
  const done = complete ? await finishDaily(db, userId, day, set, now) : null;
  return { ...revealCard(card, locked.guess, locked.tap ?? null), done };
}

// ---- finishing ----------------------------------------------------------------------------------------------------------
export function shareText(o: { n: number; results: boolean[]; streak: number; giveaways: number; practice?: boolean }, host = appHost()): string {
  const score = o.results.filter(Boolean).length;
  const head = `Call the Bluff #${o.n}${o.practice ? " (practice)" : ""} · ${score}/${o.results.length}${!o.practice && o.streak > 0 ? ` · 🔥${o.streak}` : ""}`;
  const lines = [head, o.results.map((r) => (r ? "🟩" : "🟥")).join("")];
  // No denominator: "2 of 3" would reveal how many of the five were scams.
  if (o.giveaways > 0) lines.push(`🔍 ${o.giveaways} giveaway${o.giveaways === 1 ? "" : "s"} spotted`);
  lines.push(`${host}/play`);
  return lines.join("\n");
}

function resultFrom(set: CardRow[], answers: StoredAnswer[], day: string, streak: number, practice: boolean): FinishResult {
  const by = new Map(answers.map((a) => [a.cardId, a]));
  const reveals = set.map((c) => { const a = by.get(c.id); return a ? revealCard(c, a.guess, a.tap ?? null) : null; });
  const results = reveals.map((r) => !!r?.correct);
  const giveaways = reveals.filter((r) => r?.giveaway).length;
  const misses = new Map<string, number>();
  set.forEach((c, i) => { if (!results[i]) misses.set(c.category, (misses.get(c.category) ?? 0) + 1); });
  const weakest = [...misses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { day, score: results.filter(Boolean).length, giveaways, streak, weakest, practice, results, shareText: shareText({ n: puzzleNumber(day), results, streak, giveaways, practice }) };
}

/** Finalize the stored daily play once every card is answered. Streak = yesterday's finished streak + 1. Idempotent. */
async function finishDaily(db: Db, userId: string, day: string, set: CardRow[], now: Date): Promise<FinishResult> {
  const row = await playRow(db, userId, day);
  if (row?.finished) return resultFrom(set, row.answers, day, row.streak, false);
  if (!row || !set.every((c) => row.answers.some((a) => a.cardId === c.id))) throw new ApiError("bad_input", "Answer all five cards first.");
  const result = resultFrom(set, row.answers, day, 0, false);
  const prev = await one<{ streak: number }>(db, "SELECT streak FROM game_plays WHERE user_id=$1 AND day=$2 AND NOT practice AND finished_at IS NOT NULL", [userId, addDays(day, -1)]);
  await db.query("UPDATE game_plays SET finished_at=$3, score=$4, giveaways=$5, streak=$6 WHERE user_id=$1 AND day=$2 AND NOT practice AND finished_at IS NULL",
    [userId, day, now, result.score, result.giveaways, (prev?.streak ?? 0) + 1]);
  const final = (await playRow(db, userId, day))!; // whoever finished first wins
  return resultFrom(set, final.answers, day, final.streak, false);
}

/**
 * Today: scores the answers locked on the server (the request body is ignored). Past days: unscored practice scored
 * from `answers`, nothing stored. A day already finished returns its stored result.
 */
export async function finishGame(db: Db, userId: string, day: string, answers: StoredAnswer[] = [], now = new Date()): Promise<FinishResult> {
  const today = dayKey(now);
  if (day > today) throw new ApiError("bad_input", "That day hasn't happened yet");
  const set = await cardsForDay(db, day);
  const row = await playRow(db, userId, day);
  if (row?.finished) return resultFrom(set, row.answers, day, row.streak, false);
  if (isLive(day, today, row)) return finishDaily(db, userId, day, set, now);
  return resultFrom(set, answers, day, 0, true);
}

// ---- stats, streaks, archive ------------------------------------------------------------------------------------------
export async function currentStreak(db: Db, userId: string, today: string): Promise<number> {
  const r = await one<{ day: string; streak: number }>(db,
    "SELECT day::text AS day, streak FROM game_plays WHERE user_id=$1 AND NOT practice AND finished_at IS NOT NULL ORDER BY day DESC LIMIT 1", [userId]);
  if (!r) return 0;
  return Math.round((Date.parse(today) - Date.parse(r.day)) / DAY_MS) <= 1 ? r.streak : 0;
}

/** Finished dailies only (practice and abandoned games never count). Win = 4 or 5 out of 5. */
export async function gameStats(db: Db, userId: string, today: string): Promise<Stats> {
  const rows = await many<{ score: number; n: number; mx: number }>(db,
    "SELECT score, count(*)::int n, max(streak)::int mx FROM game_plays WHERE user_id=$1 AND NOT practice AND finished_at IS NOT NULL GROUP BY score", [userId]);
  const dist = [0, 0, 0, 0, 0, 0];
  for (const r of rows) dist[Math.min(5, Math.max(0, r.score))] += r.n;
  const played = dist.reduce((a, b) => a + b, 0);
  const pct = (n: number) => (played ? Math.round((n / played) * 100) : 0);
  return {
    played, winPct: pct(dist[4] + dist[5]), perfectPct: pct(dist[5]),
    currentStreak: await currentStreak(db, userId, today), maxStreak: Math.max(0, ...rows.map((r) => r.mx)), dist,
  };
}

export async function archiveDays(db: Db, userId: string, today: string, n = 7): Promise<ArchiveDay[]> {
  const days = Array.from({ length: n }, (_, i) => addDays(today, -(i + 1))).filter((d) => d >= GAME_START);
  if (!days.length) return [];
  const rows = await many<{ day: string; score: number }>(db,
    "SELECT day::text AS day, score FROM game_plays WHERE user_id=$1 AND NOT practice AND finished_at IS NOT NULL AND day = ANY($2::date[])", [userId, days]);
  const by = new Map(rows.map((r) => [r.day, r.score]));
  return days.map((d) => ({ day: d, n: puzzleNumber(d), score: by.get(d) ?? null }));
}

/** After today's daily: one charge from the user's own Capital One scan (theirs only, unscored), or a nudge to scan. */
async function bonusFor(db: Db, userId: string, day: string): Promise<Bonus> {
  const id = await ensureBankCard(db, userId, day).catch((e) => { console.error("[bankcard]", (e as Error).message); return null; });
  const c = id ? await one<CardRow>(db, `SELECT ${COLS} FROM game_cards WHERE id=$1 AND user_id=$2`, [id, userId]) : null;
  return c ? { status: "ready", card: toPublic(c) } : { status: "locked" };
}

/** Everything /play needs for one day: cards, the locked progress or finished board, stats, countdown, bonus, archive. */
export async function gameState(db: Db, userId: string, day: string, opts: { now?: Date; practiceAnswers?: StoredAnswer[] } = {}): Promise<GameState> {
  const now = opts.now ?? new Date();
  const today = dayKey(now);
  const set = await cardsForDay(db, day);
  const row = await playRow(db, userId, day);
  const live = isLive(day, today, row);
  const practice = !live && !row?.finished;
  let progress: Reveal[] = [];
  let done: FinishResult | null = null;
  if (row && (live || row.finished)) {
    progress = revealsFor(set, row.answers);
    if (row.finished) done = resultFrom(set, row.answers, day, row.streak, false);
  } else if (practice && opts.practiceAnswers) {
    progress = revealsFor(set, opts.practiceAnswers);
    done = resultFrom(set, opts.practiceAnswers, day, 0, true);
  }
  const stats = await gameStats(db, userId, today);
  return {
    day, n: puzzleNumber(day), isToday: day === today, practice, cards: set.map(toPublic), progress, done, stats,
    streak: stats.currentStreak, nextAt: nextPuzzleAt(now), serverNow: now.toISOString(),
    bonus: day === today && done && !practice ? await bonusFor(db, userId, day) : null,
    archive: await archiveDays(db, userId, today),
  };
}
