import { MessageInvestigateSchema } from "@/lib/schemas";
import { ApiError, handle } from "@/lib/errors";
import { enforceAgentRateLimit, failureFrom, getContext, json, parseBody, requireEvalKey } from "@/lib/api/helpers";
import { runToCompletion, startRun } from "@/lib/agent/runs";
import { ensureAccount } from "@/lib/accounts";
import { EVAL_USER_ID } from "@/lib/config";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  const body = await parseBody(req, MessageInvestigateSchema);
  const text = body.text.trim();
  if (!text) throw new ApiError("bad_input", "Paste a text message or link to check");
  if (body.source === "eval") {
    requireEvalKey(req);
    // The eval harness sends no cookie: its checks are stored under the eval user, not a new account per request.
    const r = await runToCompletion({ kind: "message", userId: EVAL_USER_ID, text, source: "eval" });
    return json(ctx, { verdict: r.verdict, mode: r.mode });
  }
  enforceAgentRateLimit(ctx);
  await ensureAccount(getPool(), ctx.userId);
  const { runId } = await startRun({ kind: "message", userId: ctx.userId, text, source: body.source }, { fail: failureFrom(req, ctx) });
  return json(ctx, { runId });
});
