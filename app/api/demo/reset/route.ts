import { handle } from "@/lib/errors";
import { getContext, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { resetDemo } from "../../../../scripts/seed/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  requireDemo(ctx, { strict: true });
  await resetDemo(getPool());
  return new Response(null, { status: 204 });
});
