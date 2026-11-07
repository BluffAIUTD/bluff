import { ApiError, handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
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
  const cards = await cardsForDay(db, day);
  const played = day === today ? await playedToday(db, ctx.userId, day) : null;
  return json(ctx, { day, n: puzzleNumber(day), isToday: day === today, cards: cards.map(toPublic), streak: await currentStreak(db, ctx.userId, today), alreadyPlayed: played ? { score: played.score } : null });
});
