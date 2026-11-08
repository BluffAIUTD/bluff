import { handle } from "@/lib/errors";
import { getContext, withSession } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { resetAccount } from "@/lib/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete everything: exposures, verdicts, agent runs, disputes, messages, game plays, crawls and allowlist entries for
 * this visitor's account (cascade from the user row), then re-create it with a fresh demo history so the app stays usable.
 * Only the caller's own account is affected.
 */
export const DELETE = handle(async (req: Request) => {
  const ctx = getContext(req);
  await resetAccount(getPool(), ctx.userId);
  return withSession(new Response(null, { status: 204 }), ctx);
});
