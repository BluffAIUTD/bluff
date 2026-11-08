import { ApiError, handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { generateCards } from "@/lib/gamegen";
import { ensureBankCard } from "@/lib/bankcard";
import { cardsForDay, currentStreak, dayKey, playedToday, puzzleNumber, toPublic } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's 5 cards (no answers). `?d=YYYY-MM-DD` opens a past day for practice. */
export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  const today = dayKey();
  const d = new URL(req.url).searchParams.get("d");
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ApiError("bad_input", "Bad date");
  const day = d && d <= today ? d : today;
  const db = getPool();
  // Pre-generate tomorrow's set in the background (live model only) so a day's cards are fixed before anyone opens them.
  const tomorrow = new Date(Date.parse(today) + 86_400_000).toISOString().slice(0, 10);
  void generateCards(db, tomorrow).catch((e) => console.error("[gamegen]", (e as Error).message));
  // The user's own Capital One scan feeds one card into today's set (no-op until a scan has run).
  if (day === today) await ensureBankCard(db, ctx.userId, day).catch((e) => console.error("[bankcard]", (e as Error).message));
  const cards = await cardsForDay(db, day);
  const played = day === today ? await playedToday(db, ctx.userId, day) : null;
  return json(ctx, { day, n: puzzleNumber(day), isToday: day === today, cards: cards.map(toPublic), streak: await currentStreak(db, ctx.userId, today), alreadyPlayed: played ? { score: played.score } : null });
});
