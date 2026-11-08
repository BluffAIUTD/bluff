import { z } from "zod";
import { ApiError, handle } from "@/lib/errors";
import { enforceAgentRateLimit, failureFrom, getUserContext, json, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { findScript, nextScript, postScriptedCharge } from "@/lib/demo";
import { startRun } from "@/lib/agent/runs";
import { getTransactionWithFlags } from "@/lib/rules/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ scriptId: z.string().optional(), store: z.string().optional() }).default({});

/** Posts the next scripted charge (or the one for a store) and starts the agent run on it. */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  requireDemo(ctx);
  const text = await req.text();
  const body = Body.parse(text ? JSON.parse(text) : {});
  const db = getPool();
  const script = body.scriptId || body.store ? findScript({ scriptId: body.scriptId, storeSlug: body.store }) : await nextScript(db, ctx.userId);
  if (!script) throw new ApiError("not_found", body.scriptId || body.store ? "No scripted charge for that store" : "All scripted charges have been posted. Reset the demo to replay them.");
  enforceAgentRateLimit(ctx);
  const posted = await postScriptedCharge(db, ctx.userId, script);
  const { runId } = await startRun({ kind: "txn", userId: ctx.userId, txnId: posted.id }, { fail: failureFrom(req, ctx) });
  const transaction = await getTransactionWithFlags(db, ctx.userId, posted.id);
  return json(ctx, { transaction, runId, simulatedDelayDays: posted.simulatedDelayDays, scriptId: script.id }, { status: posted.created ? 201 : 200 });
});
