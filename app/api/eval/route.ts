import { handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { readEvalResults } from "@/lib/eval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Contents of eval/results.json, or { results: null } when no run has been committed yet. */
export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  return json(ctx, { results: readEvalResults() });
});
