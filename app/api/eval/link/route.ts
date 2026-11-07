import { z } from "zod";
import { ApiError, handle } from "@/lib/errors";
import { getContext, json, parseBody, requireEvalKey } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { EVAL_USER_ID } from "@/lib/config";
import { linkTransaction } from "@/lib/linker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ txnId: z.string().min(1) });

/** Claim B harness: the linker's predicted exposure for a charge on the eval user. Never reveals ground truth. */
export const POST = handle(async (req: Request) => {
  requireEvalKey(req);
  const ctx = getContext(req);
  const { txnId } = await parseBody(req, Body);
  const r = /^[0-9a-f-]{36}$/i.test(txnId) ? await linkTransaction(getPool(), EVAL_USER_ID, txnId) : null;
  if (!r) throw new ApiError("not_found", "Charge not found");
  const top = r.candidates[0];
  // candidateExposureId/score are the best candidate regardless of the production threshold, so the harness can sweep thresholds on the dev split.
  return json(ctx, { predictedExposureId: r.best?.exposureId ?? null, candidateExposureId: top?.exposureId ?? null, score: top?.matchScore ?? 0, method: "sql_linker" });
});
