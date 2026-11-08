import { handle } from "@/lib/errors";
import { getContext, json } from "@/lib/api/helpers";
import { getPool, many } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recent Bluff messages for the phone preview and the Overview alert feed. */
export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit")) || 40));
  const rows = await many<{ id: string; direction: "in" | "out"; body: string; kind: string; status: string; created_at: Date; meta: Record<string, string> }>(
    getPool(),
    "SELECT id, direction, body, kind, status, created_at, meta FROM (SELECT * FROM messages WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2) m ORDER BY created_at",
    [ctx.userId, limit],
  );
  return json(ctx, { messages: rows.map((r) => ({ id: r.id, direction: r.direction, body: r.body, kind: r.kind, status: r.status, createdAt: r.created_at.toISOString(), meta: r.meta })) });
});
