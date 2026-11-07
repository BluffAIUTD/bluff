import { PageInvestigateSchema } from "@/lib/schemas";
import { handle } from "@/lib/errors";
import { enforceAgentRateLimit, failureFrom, getContext, json, parseBody } from "@/lib/api/helpers";
import { parseUrl } from "@/lib/api/hosts";
import { startRun } from "@/lib/agent/runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  const body = await parseBody(req, PageInvestigateSchema);
  enforceAgentRateLimit(ctx);
  const { url, host } = parseUrl(body.url);
  const { runId } = await startRun(
    { kind: "page", userId: ctx.userId, url, host: body.host ?? host, fieldTypes: body.fieldTypes, signals: body.signals, source: body.source },
    { fail: failureFrom(req, ctx) },
  );
  return json(ctx, { runId });
});
