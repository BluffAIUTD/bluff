import { ApiError, handle } from "@/lib/errors";
import { enforceAgentRateLimit, getContext, json } from "@/lib/api/helpers";
import { nessieConfigured } from "@/lib/nessie/client";
import { scanState, startBankScan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Current bank-scan state: recent Nessie merchants with their latest site verdicts. Starts nothing. */
export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  return json(ctx, { configured: nessieConfigured(), ...(await scanState(ctx.userId)) });
});

/** Sync from Capital One Nessie, then start one Nemotron site run per merchant. `?fresh=1` ignores today's verdicts. */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  if (!nessieConfigured()) throw new ApiError("upstream_down", "Capital One Nessie isn't configured (NESSIE_API_KEY).");
  enforceAgentRateLimit(ctx);
  try {
    return json(ctx, { configured: true, ...(await startBankScan(ctx.userId, { fresh: new URL(req.url).searchParams.get("fresh") === "1" })) });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError("upstream_down", `Couldn't reach Capital One Nessie: ${(e as Error).message.slice(0, 160)}`);
  }
});
