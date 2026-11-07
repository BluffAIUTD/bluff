import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, parseBody, requireDemo } from "@/lib/api/helpers";
import { getPool, one } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { handleInbound } from "@/lib/photon/inbound";
import { MOCK_PHONE } from "@/lib/photon/notify";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ text: z.string().max(5000) });

/** Phone Preview: type a text to Bluff as the demo user while PHOTON_MODE=mock (also a live backup on stage). */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  requireDemo(ctx);
  const { text } = await parseBody(req, Body);
  const db = getPool();
  const u = await one<{ phone: string | null }>(db, "SELECT phone FROM users WHERE id=$1", [ctx.userId]);
  const from = u?.phone || getConfig().photon.demoUserPhone || MOCK_PHONE;
  const r = await handleInbound(db, { from, text, providerId: `sim_${randomUUID()}`, hasImage: false }, { userId: ctx.userId });
  return json(ctx, r);
});
