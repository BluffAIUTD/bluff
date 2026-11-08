import { z } from "zod";
import { ApiError, handle } from "@/lib/errors";
import { getUserContext, json, parseBody, requireDemo } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { nessieConfigured, NessieError } from "@/lib/nessie/client";
import { CardHeldError, HOLD_MESSAGE, pushPurchase, takePushToken } from "@/lib/nessie/push";
import { startBankScan } from "@/lib/scan";
import { cardHold } from "@/lib/safesignal";
import { livePushPreset } from "@/data/nessieSeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PushSchema = z.object({
  preset: z.string().min(1).max(64),
  /** whole dollars; clamped to 1-999 (Nessie stores integer amounts) */
  amount: z.number().finite().optional(),
  /** run a fresh Nemotron review instead of reusing one from the last 24 h (the crawl is reused either way) */
  fresh: z.boolean().default(true),
});

/**
 * "Make a test purchase": posts a real purchase to the Capital One Nessie sandbox card, mirrors it into this visitor's
 * transactions, and starts a partial bank scan of just that merchant. Returns the scan id to stream.
 */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  requireDemo(ctx);
  const body = await parseBody(req, PushSchema);
  if (!livePushPreset(body.preset)) throw new ApiError("bad_input", "Unknown store. Pick one of the presets.");
  if (!nessieConfigured()) throw new ApiError("upstream_down", "Capital One Nessie isn't connected on this server (NESSIE_API_KEY).");
  // A held card is declined before a rate-limit token is taken, so trying the decline a few times never blocks the
  // purchase after UNHOLD. pushPurchase checks again (the hold can change in between); a failing check never blocks.
  const hold = await cardHold(getPool(), ctx.userId).catch(() => ({ held: false, since: null as string | null }));
  if (hold.held) return json(ctx, { error: { code: "card_on_hold", message: HOLD_MESSAGE }, held: true, since: hold.since }, { status: 409 });
  const lim = takePushToken(ctx.userId, { ip: ctx.ip, presenter: ctx.demoUnlocked });
  if (!lim.ok) {
    throw new ApiError("rate_limited", lim.scope === "user"
      ? `That's a lot of test purchases. Try again in ${lim.retryAfterSec}s.`
      : `The demo card is busy right now. Try again in ${lim.retryAfterSec}s.`, undefined, lim.retryAfterSec);
  }
  let r: Awaited<ReturnType<typeof pushPurchase>>;
  try {
    r = await pushPurchase(getPool(), ctx.userId, { preset: body.preset, amount: body.amount });
  } catch (e) {
    if (e instanceof CardHeldError) return json(ctx, { error: { code: "card_on_hold", message: HOLD_MESSAGE }, held: true, since: e.since }, { status: 409 });
    if (e instanceof NessieError) {
      console.warn("[push] nessie error", e.message);
      throw new ApiError("upstream_down", e.status === 0 ? "Couldn't reach Capital One Nessie. Try again in a moment." : `Capital One Nessie didn't accept the purchase (HTTP ${e.status}). Try again in a moment.`);
    }
    throw e;
  }
  const scanId = startBankScan(ctx.userId, { only: { txnIds: [r.txnId] }, skipSync: true, freshReview: body.fresh, reason: "push" });
  return json(ctx, { ...r, scanId });
});
