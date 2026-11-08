import { handle } from "@/lib/errors";
import { getUserContext, json } from "@/lib/api/helpers";
import { watchCard } from "@/lib/scan/watch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One "watching your card" check (the /scan page calls it every ~20 s while visible): sync from Capital One Nessie
 * (throttled to once per 15 s per visitor) and, when there are new purchases, start a partial scan of just those.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  return json(ctx, await watchCard(ctx.userId));
});
