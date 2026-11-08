import { GameAnswerSchema } from "@/lib/schemas";
import { handle } from "@/lib/errors";
import { getUserContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { answerCard } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** One call on one card. Today's first answer per card is locked; a repeat returns the locked answer. */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  const body = await parseBody(req, GameAnswerSchema);
  return json(ctx, await answerCard(getPool(), ctx.userId, body));
});
