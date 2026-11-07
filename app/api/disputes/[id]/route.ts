import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { markFiled } from "@/lib/disputes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ status: z.literal("filed") });

/** "Mark as filed" records the user's own action. Status only; Bluff never files anything. */
export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = getContext(req);
  const { id } = await params;
  await parseBody(req, Body);
  return json(ctx, { dispute: await markFiled(getPool(), ctx.userId, id) });
});
