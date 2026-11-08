import { ApiError, handle } from "@/lib/errors";
import { enforceAgentRateLimit, failureFrom, getUserContext, json } from "@/lib/api/helpers";
import { getPool, one } from "@/lib/db";
import { startRun } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getUserContext(req);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !(await one(getPool(), "SELECT 1 FROM transactions WHERE id=$1 AND user_id=$2", [id, ctx.userId]))) throw new ApiError("not_found", "Charge not found");
  enforceAgentRateLimit(ctx);
  const { runId } = await startRun({ kind: "txn", userId: ctx.userId, txnId: id }, { fail: failureFrom(req, ctx) });
  return json(ctx, { runId });
});
