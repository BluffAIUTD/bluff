import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { generateCards } from "@/lib/gamegen";
import { addDays, dayKey } from "@/lib/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).default({});

/** Presenter/cron trigger. Defaults to tomorrow's set so the day's cards are fixed before anyone opens them. */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  requireDemo(ctx, { strict: true });
  const text = await req.text();
  const body = Body.parse(text ? JSON.parse(text) : {});
  const day = body.day ?? addDays(dayKey(), 1);
  return json(ctx, { day, ...(await generateCards(getPool(), day)) });
});
