import { ApiError, handle } from "@/lib/errors";
import { getUserContext, json } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { getRunSnapshot } from "@/lib/agent/runs";
import { latestSiteScan } from "@/lib/scan/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full detail for one merchant site: crawled pages with what was found on each, registry facts, both tiers and the trace. */
export const GET = handle(async (req: Request) => {
  const ctx = await getUserContext(req);
  const host = new URL(req.url).searchParams.get("host") ?? "";
  if (!host || host.length > 300) throw new ApiError("bad_input", "host is required");
  const db = getPool();
  const s = await latestSiteScan(db, ctx.userId, host);
  if (!s) throw new ApiError("not_found", "This site hasn't been scanned yet");
  const run = (await db.query("SELECT id FROM agent_runs WHERE user_id=$1 AND trigger='site' AND subject_id=$2 AND status <> 'running' ORDER BY started_at DESC LIMIT 1", [ctx.userId, host])).rows[0];
  const snap = run ? await getRunSnapshot(run.id) : null;
  return json(ctx, {
    host, createdAt: s.createdAt, intel: s.intel, basic: s.basic,
    pages: s.crawl.pages.map((p) => ({ url: p.url, path: p.path, type: p.type, title: p.title, words: p.wordCount, status: p.status, emails: p.emails, phones: p.phones, payments: p.payments, policy: p.policyFlags, forms: p.forms.flatMap((f) => f.fields), excerpt: p.text.slice(0, 400) })),
    crawl: { origin: s.crawl.origin, finalHost: s.crawl.finalHost, https: s.crawl.https, ms: s.crawl.ms, robots: s.crawl.robots.found, sitemapUrls: s.crawl.sitemapUrls, failed: s.crawl.failed, skippedByRobots: s.crawl.skippedByRobots, error: s.crawl.error, ownStore: s.crawl.ownStore },
    deep: snap?.verdict ?? null, trace: snap?.steps ?? [], runId: run?.id ?? null,
  });
});
