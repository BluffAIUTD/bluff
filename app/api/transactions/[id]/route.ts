import { ApiError, handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { getTransactionDetail } from "@/lib/transactions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = getContext(req);
  const { id } = await params;
  const d = await getTransactionDetail(getPool(), ctx.userId, id);
  if (!d) throw new ApiError("not_found", "Charge not found");
  return json(ctx, d);
});
