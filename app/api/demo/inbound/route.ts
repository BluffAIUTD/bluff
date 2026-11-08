import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, parseBody, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { handleInbound } from "@/lib/messaging/inbound";
import { PHONE_PREVIEW } from "@/lib/messaging/notify";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().max(5000) });

/** Phone preview: the user texts Bluff (forward a message to check, or a command like HELP). */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  requireDemo(ctx);
  const { text } = await parseBody(req, Body);
  const r = await handleInbound(getPool(), { from: PHONE_PREVIEW, text, providerId: `pp_${randomUUID()}`, hasImage: false }, { userId: ctx.userId });
  return json(ctx, r);
});
