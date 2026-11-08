import { GameFinishSchema } from "@/lib/schemas";
import { handle } from "@/lib/errors";
import { getUserContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { finishGame, gameState } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Finish a day and return the full game state with the finished board. Today is scored from the locked answers only. */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  const body = await parseBody(req, GameFinishSchema);
  const db = getPool();
  const result = await finishGame(db, ctx.userId, body.day, body.answers ?? []);
  return json(ctx, await gameState(db, ctx.userId, body.day, { practiceAnswers: result.practice ? body.answers ?? [] : undefined }));
});
