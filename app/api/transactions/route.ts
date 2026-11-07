import { handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { listTransactionsWithFlags } from "@/lib/rules/flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 50));
  return json(ctx, { transactions: await listTransactionsWithFlags(getPool(), ctx.userId, limit) });
});
