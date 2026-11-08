import { PageInvestigateSchema } from "@/lib/schemas";
import { handle } from "@/lib/errors";
import { enforceAgentRateLimit, failureFrom, getUserContext, json, parseBody } from "@/lib/api/helpers";
import { parseUrl } from "@/lib/api/hosts";
import { startRun } from "@/lib/agent/runs";
import { pageSiteReviewAvailable } from "@/lib/scan/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  const body = await parseBody(req, PageInvestigateSchema);
  enforceAgentRateLimit(ctx);
  const parsed = parseUrl(body.url);
  // The extension only sends the page's origin; enforce it here too, so no path, query or hash is stored or sent to the model.
  const url = body.source === "extension" ? `${new URL(parsed.url).origin}/` : parsed.url;
  const subject = body.host ?? parsed.host;
  const { runId } = await startRun(
    { kind: "page", userId: ctx.userId, url, host: subject, fieldTypes: body.fieldTypes, signals: body.signals, source: body.source },
    { fail: failureFrom(req, ctx), fresh: new URL(req.url).searchParams.get("fresh") === "1" },
  );
  // siteReview: Bluff crawls the site's public pages and Nemotron reviews the scraped content (live agent only).
  return json(ctx, { runId, siteReview: pageSiteReviewAvailable(subject) });
});
