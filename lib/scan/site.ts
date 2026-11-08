import { getConfig, liveAgentAvailable } from "../config";
import type { Db } from "../db";
import { STORES } from "../../data/stores";
import { basicCheck } from "./basic";
import { crawlSite, splitWebsite, type Crawl, type CrawlOptions } from "./crawl";
import { isAllowlisted, siteIntel, type SiteIntel } from "./intel";
import { latestSharedSiteScan, saveSiteScan, type SiteScan } from "./store";
import { mapDemoHost, ownStoreSlug } from "./stores";
import { normalizeHost } from "./website";

/** Crawl result for a merchant with no website (nothing to fetch). */
export const noWebsiteCrawl = (error = "No website found for this merchant"): Crawl => ({
  host: "", origin: "", finalHost: "", https: false, redirectedOffsite: false, botBlocked: false, ms: 0, robots: { found: false, disallow: [], sitemaps: [] },
  sitemapUrls: 0, candidates: 0, pages: [], failed: [], skippedByRobots: [], ownStore: null, error,
});
export const noWebsiteIntel = (): SiteIntel => ({
  domain: "", registration: { createdAt: null, ageDays: null, expiresAt: null, registrar: null, source: "unknown" },
  tls: { ok: false, issuer: null, validFrom: null, validTo: null, ageDays: null }, dns: { mx: null, ns: [] }, wayback: { firstSeen: null, years: null, source: "none" }, allowlisted: false,
});

export type ScanWebsiteOptions = {
  /** Website to crawl (host plus optional start path), or null when the merchant has none. */
  website: string | null;
  /** site_scans.host: the key later lookups use (defaults to the website). */
  key?: string;
  merchant: string;
  priorCharges?: number;
  crawl?: Pick<CrawlOptions, "maxPages" | "budgetMs" | "fetcher" | "onPage">;
};

/** Crawl the website + registry facts, run the rules-only basic check, and store everything as one site_scans row. */
export async function scanWebsite(db: Db, userId: string, o: ScanWebsiteOptions): Promise<SiteScan> {
  const [crawl, intel] = o.website
    ? await Promise.all([crawlSite(o.website, o.crawl), siteIntel(db, userId, splitWebsite(o.website).host)])
    : [noWebsiteCrawl(), noWebsiteIntel()];
  const basic = basicCheck(crawl, intel, { priorCharges: o.priorCharges ?? 0 });
  return saveSiteScan(db, userId, { host: o.key ?? o.website ?? o.merchant, merchant: o.merchant, crawl, intel, basic });
}

/**
 * A recent crawl of `host` by any account, as this user's own scan. Crawls and registry facts are public facts about a
 * website, so one visitor's crawl spares the next one the wait. Another account's crawl is copied with the personal
 * parts recomputed for this user (their allowlist and how often they have paid this merchant); the user's own recent
 * crawl is returned as-is. Pass `fresh` at the call site (the re-scan buttons) to crawl again instead.
 */
export async function reuseSiteScan(db: Db, userId: string, host: string, maxAgeHours: number, history: { priorCharges: number } = { priorCharges: 0 }): Promise<SiteScan | null> {
  const hit = await latestSharedSiteScan(db, host, maxAgeHours);
  if (!hit) return null;
  if (hit.userId === userId) return hit.scan;
  const s = hit.scan;
  const demo = s.intel.registration.source === "demo_registry";
  const intel: SiteIntel = { ...s.intel, allowlisted: demo ? false : await isAllowlisted(db, userId, s.intel.domain) };
  return saveSiteScan(db, userId, { host: s.host, merchant: s.merchant, crawl: s.crawl, intel, basic: basicCheck(s.crawl, intel, history) });
}

// ---- page checks (/check links, Checkout Guard extension) -----------------------------------------------------------

/** Page checks crawl at most this many pages, within this budget, so the whole check stays under the client's 40 s limit. */
export const PAGE_CRAWL_PAGES = 8;
export const PAGE_CRAWL_BUDGET_MS = 10_000;
/** A page check reuses a crawl of the same site from the last 6 hours (the bank scan uses the same window). */
export const PAGE_CRAWL_REUSE_HOURS = 6;

/** PAGE_CRAWL=0 turns off crawling for page checks (the model then sees only the domain and the extension's signals). */
export const pageCrawlEnabled = () => process.env.PAGE_CRAWL !== "0";

/**
 * The website a page check should crawl, or null when there is nothing crawlable. Bluff's demo stores ("fastkicks-shop",
 * "fastkicks-shop.localhost", "fastkicks-shop.<BASE_DOMAIN>") map to where this deployment serves them; any other
 * host that looks like a domain is crawled as-is, homepage first. Only the host is used, never the user's URL path or query.
 */
export function pageCrawlTarget(host: string): string | null {
  const raw = (host ?? "").trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/[/?#].*$/, "");
  if (!raw || raw.length > 253) return null;
  const slug = ownStoreSlug(raw) ?? (STORES.some((s) => s.slug === raw) ? raw : null);
  if (slug) return mapDemoHost(`${slug}.demo`);
  const h = normalizeHost(raw);
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(h)) return null;
  return h;
}

/** True when a page check of `host` will crawl the site and have Nemotron review the scraped pages. */
export const pageSiteReviewAvailable = (host: string) => liveAgentAvailable(getConfig()) && pageCrawlEnabled() && pageCrawlTarget(host) !== null;

/** The crawl a page check reviews: a recent one of the same site (by anyone), else a fresh bounded crawl (saved for reuse). */
export async function pageSiteScan(db: Db, userId: string, host: string, o: { fresh?: boolean; fetcher?: CrawlOptions["fetcher"] } = {}): Promise<{ scan: SiteScan; cached: boolean } | null> {
  const target = pageCrawlTarget(host);
  if (!target) return null;
  const recent = o.fresh ? null : await reuseSiteScan(db, userId, target, PAGE_CRAWL_REUSE_HOURS);
  if (recent) return { scan: recent, cached: true };
  const scan = await scanWebsite(db, userId, { website: target, merchant: host, crawl: { maxPages: PAGE_CRAWL_PAGES, budgetMs: PAGE_CRAWL_BUDGET_MS, fetcher: o.fetcher } });
  return { scan, cached: false };
}
