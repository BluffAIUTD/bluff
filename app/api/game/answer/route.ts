import { GameAnswerSchema } from "@/lib/schemas";
import { handle } from "@/lib/errors";
import { getContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { answerCard } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  const body = await parseBody(req, GameAnswerSchema);
  return json(ctx, await answerCard(getPool(), body.cardId, body.guess));
});
