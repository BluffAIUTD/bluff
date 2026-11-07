import { z } from "zod";
import { handle } from "@/lib/errors";
import { getContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { createDispute } from "@/lib/disputes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ txnId: z.string().min(1), regenerate: z.boolean().optional() });

/** Drafts a dispute packet. Drafts only: nothing is sent or filed. */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  const body = await parseBody(req, Body);
  const { dispute, created } = await createDispute(getPool(), ctx.userId, body.txnId, { regenerate: body.regenerate });
  return json(ctx, { dispute }, { status: created ? 201 : 200 });
});
