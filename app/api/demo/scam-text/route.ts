import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ApiError, handle } from "@/lib/errors";
import { enforceAgentRateLimit, getUserContext, json, parseBody, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { handleInbound } from "@/lib/messaging/inbound";
import { PHONE_PREVIEW } from "@/lib/messaging/notify";
import { findInboxText, scamTexts } from "@/data/scamTexts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The phone's Messages inbox (synthetic texts). Which ones are scams is not sent: the user decides, then reports. */
export const GET = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  return json(ctx, { texts: scamTexts().map(({ id, sender, received, body }) => ({ id, sender, received, body })) });
});

const Body = z.object({ id: z.string().min(1).max(40) });

/**
 * "Report to Bluff" (like forwarding spam to a carrier's short code): the text goes through Bluff's inbound handler, the
 * verdict reply lands in the Bluff thread, and the text is discarded. Only a salted hash of the sender is kept, at most.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  requireDemo(ctx);
  enforceAgentRateLimit(ctx); // every report is an agent run
  const { id } = await parseBody(req, Body);
  const t = findInboxText(id);
  if (!t) throw new ApiError("not_found", "Unknown message");
  const r = await handleInbound(getPool(), { from: PHONE_PREVIEW, text: t.body, providerId: `report_${randomUUID()}`, hasImage: false }, { userId: ctx.userId, report: { sender: t.sender } });
  return json(ctx, r);
});
