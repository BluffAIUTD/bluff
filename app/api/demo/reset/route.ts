import { handle } from "@/lib/errors";
import { getContext, requireDemo, withSession } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { resetAccount } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Presenter reset: re-seeds the caller's own account (scripted charges can be replayed). Other visitors are untouched. */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  requireDemo(ctx, { strict: true });
  await resetAccount(getPool(), ctx.userId);
  return withSession(new Response(null, { status: 204 }), ctx);
});
