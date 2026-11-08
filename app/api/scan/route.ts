import { handle } from "@/lib/errors";
import { enforceAgentRateLimit, getUserContext, json } from "@/lib/api/helpers";
import { scanState, startBankScan } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bank-scan state for page load: recent Nessie merchants with their latest basic check and deep analysis. Starts nothing. */
export const GET = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  return json(ctx, await scanState(ctx.userId));
});

/** Start a scan: Nessie sync → crawl + basic check per merchant → Nemotron deep review. `?fresh=1` re-crawls everything. */
export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  enforceAgentRateLimit(ctx);
  const q = new URL(req.url).searchParams;
  return json(ctx, { scanId: startBankScan(ctx.userId, { fresh: q.get("fresh") === "1", deep: q.get("deep") !== "0" }) });
});
