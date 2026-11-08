import type { Db } from "./db";
import { many, one } from "./db";
import { getConfig } from "./config";
import { ApiError } from "./errors";

export const GAME_START = "2026-11-07";
const DAY_MS = 86_400_000;

export type CardPublic = { id: string; kind: string; content: { from?: string; subject?: string; body: string }; source: string; origin: string | null };
type CardRow = { id: string; kind: string; content: CardPublic["content"]; is_scam: boolean; red_flags: { span: string; why: string }[]; category: string; source: string; origin: string | null };

/** Max message-set cards (our synthetic dataset, or an imported one) in a 5-card day; the rest stay seeded for variety. */
export const DATASET_PER_DAY = 3;
const DATASET_SOURCES = new Set(["dataset", "tmobile"]);

/**
 * Source preference on top of pickCards: today's bank-scan card first (1), then message-set cards (up to 3),
 * each replacing a seeded card with the same answer so the scam/legit mix is unchanged. Deterministic per day.
 */
export function preferSources(picks: CardRow[], pool: CardRow[], day: string): CardRow[] {
  const out = [...picks];
  const r = rng(fnv1a(`src:${day}`));
  // Same answer only, so the day's scam/legit mix never changes. Seeded cards go first, then anything but the bank card.
  const swap = (c: CardRow, anySource = false) => {
    if (out.some((p) => p.id === c.id)) return true;
    let i = out.findIndex((p) => p.source === "seed" && p.is_scam === c.is_scam);
    if (i < 0 && anySource) i = out.findIndex((p) => p.source !== "bank" && p.is_scam === c.is_scam);
    if (i < 0) return false;
    out[i] = c;
    return true;
  };
  const bank = pool.filter((c) => c.source === "bank").sort((a, b) => a.id.localeCompare(b.id))[0];
  if (bank) swap(bank, true);
  const tm = shuffle(pool.filter((c) => DATASET_SOURCES.has(c.source)).sort((a, b) => a.id.localeCompare(b.id)), r);
  let n = out.filter((c) => DATASET_SOURCES.has(c.source)).length;
  for (const want of [true, false, true, false, true]) {
    if (n >= DATASET_PER_DAY) break;
    const c = tm.find((x) => x.is_scam === want && !out.some((p) => p.id === x.id));
    if (c && swap(c)) n++;
  }
  return out;
}

/** Calendar day in America/Chicago as YYYY-MM-DD (UTC stored, Chicago displayed). */
export function dayKey(now = new Date()): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return p;
}

export function puzzleNumber(day: string): number {
  return Math.max(1, Math.round((Date.parse(day) - Date.parse(GAME_START)) / DAY_MS) + 1);
}

function fnv1a(s: string) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function rng(seed: number) { let a = seed; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle<T>(arr: T[], r: () => number): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/** Pure, deterministic selection: 5 cards, 2–3 scam, by date. Day-specific (generated) cards take priority over the pool. */
export function pickCards(pool: CardRow[], day: string): CardRow[] {
  const r = rng(fnv1a(day));
  const sorted = [...pool].sort((a, b) => a.id.localeCompare(b.id));
  const scam = shuffle(sorted.filter((c) => c.is_scam), r);
  const legit = shuffle(sorted.filter((c) => !c.is_scam), r);
  const nScam = Math.min(scam.length, 2 + Math.floor(r() * 2));
  const picked = [...scam.slice(0, nScam), ...legit.slice(0, 5 - nScam)];
  if (picked.length < 5) picked.push(...[...scam.slice(nScam), ...legit.slice(5 - nScam)].slice(0, 5 - picked.length));
  return shuffle(picked, r);
}

/** The day's card set is fixed the first time it is opened (so a game started before midnight stays consistent). */
export async function cardsForDay(db: Db, day: string): Promise<CardRow[]> {
  const meta = await one<{ value: string }>(db, "SELECT value FROM bluff_meta WHERE key=$1", [`game_set:${day}`]);
  if (meta) {
    const ids = JSON.parse(meta.value) as string[];
    const rows = await many<CardRow>(db, "SELECT id, kind, content, is_scam, red_flags, category, source, origin FROM game_cards WHERE id = ANY($1::uuid[])", [ids]);
    const byId = new Map(rows.map((c) => [c.id, c]));
    const ordered = ids.map((i) => byId.get(i)).filter((c): c is CardRow => !!c);
    // A set fixed before today's bank scan or a T-Mobile import is rebuilt, but only while nobody has played it.
    const fresh = await one<{ bank: boolean; tm: boolean; played: boolean }>(db,
      `SELECT EXISTS (SELECT 1 FROM game_cards WHERE day=$1 AND source='bank') bank, EXISTS (SELECT 1 FROM game_cards WHERE source IN ('dataset','tmobile') AND day IS NULL) tm,
              EXISTS (SELECT 1 FROM game_plays WHERE day=$1) played`, [day]);
    const stale = !!fresh && !fresh.played && ((fresh.bank && !ordered.some((c) => c.source === "bank")) || (fresh.tm && !ordered.some((c) => DATASET_SOURCES.has(c.source))));
    if (ordered.length === ids.length && !stale) return ordered;
    if (stale) await db.query("DELETE FROM bluff_meta WHERE key=$1", [`game_set:${day}`]);
  }
  const pool = await many<CardRow>(db, "SELECT id, kind, content, is_scam, red_flags, category, source, origin FROM game_cards WHERE day IS NULL OR day = $1", [day]);
  if (pool.length < 5) throw new ApiError("upstream_down", "The card pool is empty. Seed the database.");
  const generated = pool.filter((c) => c.source !== "seed");
  const picks = pickCards(pool, day);
  // make sure today's generated/lookalike cards are in the set when present
  for (const g of generated.filter((c) => c.source === "generated" || c.source === "lookalike").slice(0, 2)) if (!picks.some((p) => p.id === g.id)) { const i = picks.findIndex((p) => p.source === "seed" && p.is_scam === g.is_scam); if (i >= 0) picks[i] = g; }
  const final = preferSources(picks, pool, day);
  picks.splice(0, picks.length, ...final);
  await db.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING", [`game_set:${day}`, JSON.stringify(picks.map((c) => c.id))]);
  return picks;
}

export const toPublic = (c: CardRow): CardPublic => ({ id: c.id, kind: c.kind, content: c.content, source: c.source, origin: c.origin ?? null });

export async function currentStreak(db: Db, userId: string, today: string): Promise<number> {
  const r = await one<{ day: Date | string; streak: number }>(db, "SELECT day, streak FROM game_plays WHERE user_id=$1 AND NOT practice ORDER BY day DESC LIMIT 1", [userId]);
  if (!r) return 0;
  const last = typeof r.day === "string" ? r.day : r.day.toISOString().slice(0, 10);
  const gap = Math.round((Date.parse(today) - Date.parse(last)) / DAY_MS);
  return gap <= 1 ? r.streak : 0;
}

export async function playedToday(db: Db, userId: string, day: string) {
  return one<{ score: number; streak: number }>(db, "SELECT score, streak FROM game_plays WHERE user_id=$1 AND day=$2 AND NOT practice", [userId, day]);
}

export async function answerCard(db: Db, cardId: string, guess: "legit" | "scam") {
  if (!/^[0-9a-f-]{36}$/i.test(cardId)) throw new ApiError("bad_input", "Unknown card");
  const c = await one<CardRow>(db, "SELECT id, kind, content, is_scam, red_flags, category, source, origin FROM game_cards WHERE id=$1", [cardId]);
  if (!c) throw new ApiError("bad_input", "Unknown card");
  return { correct: (guess === "scam") === c.is_scam, isScam: c.is_scam, redFlags: c.red_flags, category: c.category };
}

export function shareText(n: number, results: boolean[], score: number, baseDomain = getConfig().baseDomain): string {
  const host = baseDomain.startsWith("localhost") ? baseDomain : `bluff.${baseDomain}`;
  return `Call the Bluff #${n} ${results.map((r) => (r ? "🟩" : "🟥")).join("")} ${score}/5 ${host}/play`;
}

export type FinishResult = { score: number; streak: number; weakest: string | null; shareText: string; practice: boolean; results: boolean[] };

/** Scores on the server from the stored set; only the first play of *today* counts toward the streak. */
export async function finishGame(db: Db, userId: string, day: string, answers: { cardId: string; guess: "legit" | "scam" }[], now = new Date()): Promise<FinishResult> {
  const today = dayKey(now);
  if (day > today) throw new ApiError("bad_input", "That day hasn't happened yet");
  const set = await cardsForDay(db, day);
  const by = new Map(answers.map((a) => [a.cardId, a.guess]));
  const results = set.map((c) => by.has(c.id) && (by.get(c.id) === "scam") === c.is_scam);
  const score = results.filter(Boolean).length;
  const misses = new Map<string, number>();
  set.forEach((c, i) => { if (!results[i]) misses.set(c.category, (misses.get(c.category) ?? 0) + 1); });
  const weakest = [...misses.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const first = day === today && !(await playedToday(db, userId, day));
  let streak = await currentStreak(db, userId, today);
  if (first) {
    const yesterday = new Date(Date.parse(day) - DAY_MS).toISOString().slice(0, 10);
    const prev = await one<{ streak: number }>(db, "SELECT streak FROM game_plays WHERE user_id=$1 AND day=$2 AND NOT practice", [userId, yesterday]);
    streak = (prev?.streak ?? 0) + 1;
  } else if (day === today) {
    streak = (await playedToday(db, userId, day))?.streak ?? streak;
  }
  await db.query(
    `INSERT INTO game_plays (user_id, day, answers, score, streak, practice) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (user_id, day, practice) DO UPDATE SET answers=EXCLUDED.answers, score=EXCLUDED.score, streak=EXCLUDED.streak`,
    [userId, day, JSON.stringify(answers), score, streak, !first],
  );
  return { score, streak, weakest, shareText: shareText(puzzleNumber(day), results, score), practice: !first, results };
}
