import { ApiError, handle } from "@/lib/errors";
import { getUserContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { generateCards } from "@/lib/gamegen";
import { addDays, dayKey, gameState, isPuzzleDay } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Today's puzzle (no answers): the 5 cards, your locked progress or finished board, stats, countdown, bonus card and
 * the last 7 days. `?d=YYYY-MM-DD` opens a past day (unscored practice unless you played it).
 */
export const GET = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  const today = dayKey();
  const d = new URL(req.url).searchParams.get("d");
  if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ApiError("bad_input", "Bad date");
  // Future, pre-launch or impossible dates (2026-02-30) open today's puzzle instead.
  const day = d && isPuzzleDay(d, today) ? d : today;
  const db = getPool();
  // Pre-generate tomorrow's Nemotron cards in the background (live model only) so they are there when the set freezes.
  void generateCards(db, addDays(today, 1)).catch((e) => console.error("[gamegen]", (e as Error).message));
  return json(ctx, await gameState(db, ctx.userId, day));
});
