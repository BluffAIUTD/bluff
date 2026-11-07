import { ApiError, handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getRunSnapshot } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ runId: string }> }) => {
  const ctx = getContext(req);
  const { runId } = await params;
  const snap = await getRunSnapshot(runId);
  if (!snap) throw new ApiError("not_found", "Run not found");
  return json(ctx, snap);
});
