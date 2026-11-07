import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { generateCards } from "@/lib/gamegen";
import { dayKey } from "@/lib/game";

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
  const tomorrow = new Date(Date.parse(dayKey()) + 86_400_000).toISOString().slice(0, 10);
  const day = body.day ?? tomorrow;
  return json(ctx, { day, ...(await generateCards(getPool(), day)) });
});
