import { extractPage, classify, type PageFacts, type PageType } from "./extract";
import { guardedFetch, type Fetcher } from "./net";
import { renderConfig, renderPage, type Rendered } from "./render";
import { ownStoreSlug, storeOrigin } from "./stores";
import { normalizeHost } from "./website";

/** "scrapeme.live/shop/" → host scrapeme.live, start path /shop/. */
export function splitWebsite(website: string): { host: string; path: string } {
  const w = website.trim().replace(/^https?:\/\//i, "");
  const i = w.indexOf("/");
  if (i < 0) return { host: w, path: "/" };
  const p = w.slice(i).replace(/[?#].*$/, "");
  return { host: w.slice(0, i), path: p.endsWith("/") || /\.[a-z]+$/i.test(p) ? p : p + "/" };
}

/**
 * Bounded site crawler (the bank scan's "deep scrape"). Starts at the homepage, reads robots.txt and the sitemap,
 * then fetches the pages that matter for a scam check first: refunds, contact, terms, about, checkout, shipping, privacy,
 * FAQ and a couple of product pages. Same-site only, at most 10 pages / 20 s, every request SSRF-guarded, no forms submitted.
 *
 * robots.txt: every check is started by a person about a site they paid or are about to pay, so Bluff reads the pages that
 * person would see even when robots.txt disallows them (like a browser or a link preview does). robots.txt is still read
 * for its sitemap, and paths it hides are recorded: a store hiding its refund or terms pages from automated checks is a
 * finding in itself. Pages whose server HTML has too little text are rendered in headless Chromium (render.ts) when enabled.
 */
export type CrawlOptions = {
  maxPages?: number; budgetMs?: number; concurrency?: number; fetcher?: Fetcher; onPage?: (p: PageFacts, n: number) => void;
  /** Headless renderer for thin pages; defaults to renderPage (off unless RENDER_URL is set); false disables it. */
  render?: ((url: string, signal?: AbortSignal) => Promise<Rendered | null>) | false;
};
/** Fewer readable words than this on a page's server HTML means it is probably built with JavaScript. */
export const THIN_WORDS = 60;
export type FailedPage = { url: string; error: string };
export type Crawl = {
  host: string; origin: string; finalHost: string; https: boolean; redirectedOffsite: boolean; botBlocked: boolean; ms: number;
  robots: { found: boolean; disallow: string[]; sitemaps: string[] }; sitemapUrls: number; candidates: number;
  pages: PageFacts[]; failed: FailedPage[];
  /** Always empty now (robots.txt no longer blocks a user-requested check); kept for older stored crawls and the UI. */
  skippedByRobots: string[];
  /** Paths robots.txt disallows that Bluff read anyway, e.g. ["/refund-policy.html"]. */
  robotsHidden?: string[];
  /** Pages rendered in headless Chromium because their HTML had too little text. */
  rendered?: number;
  ownStore: string | null; error?: string;
};

const PRIORITY: Record<PageType, number> = { refund: 100, contact: 95, terms: 90, about: 85, checkout: 80, shipping: 70, faq: 65, privacy: 60, product: 40, other: 10, home: 0 };
const CAP: Partial<Record<PageType, number>> = { product: 2, other: 1 };
const SKIP = /\.(jpe?g|png|gif|webp|svg|ico|pdf|zip|mp4|mp3|woff2?|ttf|css|js|json)(\?|$)|\/(wp-admin|wp-login|account|login|signin|sign-in|register|admin|auth|logout|cart\/add)\b|[?&](add-to-cart|replytocom|s|q|search)=/i;
const BLOCK_RE = /access denied|just a moment|attention required|are you a robot|captcha|request blocked|pardon our interruption/i;
const registrable = (h: string) => h.split(".").slice(-2).join(".");

export function parseRobots(txt: string): { disallow: string[]; sitemaps: string[] } {
  const disallow: string[] = [], sitemaps: string[] = [];
  let applies = false, sawRule = false;
  for (const line of txt.split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(#.*)?$/i.exec(line);
    if (!m) continue;
    const [k, v] = [m[1].toLowerCase(), m[2]];
    if (k === "sitemap") { sitemaps.push(v); continue; }
    if (k === "user-agent") { if (sawRule) { applies = false; sawRule = false; } applies = applies || v === "*" || /bluffscanner/i.test(v); continue; }
    if (k === "disallow" || k === "allow") sawRule = true;
    if (k === "disallow" && applies && v) disallow.push(v);
  }
  return { disallow, sitemaps };
}

export function robotsAllows(path: string, disallow: string[]): boolean {
  return !disallow.some((rule) => {
    const re = new RegExp("^" + rule.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    return re.test(path);
  });
}

const isHtml = (r: { headers: Record<string, unknown>; body: string }) => /html/i.test(String(r.headers["content-type"] ?? "")) || /^\s*<(!doctype|html)/i.test(r.body);

export async function crawlSite(rawHost: string, opts: CrawlOptions = {}): Promise<Crawl> {
  const t0 = Date.now();
  const maxPages = opts.maxPages ?? 10, budget = opts.budgetMs ?? 20_000, conc = opts.concurrency ?? 3;
  const fetcher = opts.fetcher ?? guardedFetch;
  const signal = AbortSignal.timeout(budget);
  const { host: rawOnly, path: startPath } = splitWebsite(rawHost);
  const slug = ownStoreSlug(rawOnly);
  const host = slug ? rawOnly.toLowerCase() : normalizeHost(rawOnly);
  const out: Crawl = { host, origin: "", finalHost: host, https: false, redirectedOffsite: false, botBlocked: false, ms: 0, robots: { found: false, disallow: [], sitemaps: [] }, sitemapUrls: 0, candidates: 0, pages: [], failed: [], skippedByRobots: [], robotsHidden: [], rendered: 0, ownStore: slug };
  const fetchOne = (url: string) => fetcher(url, AbortSignal.any([signal, AbortSignal.timeout(8_000)]));
  // Headless fallback: only for real sites (our demo stores are static HTML), only for thin pages, a few per site.
  const render = opts.render === false || slug ? null : (opts.render ?? (renderConfig().enabled ? renderPage : null));
  const renderCap = renderConfig().maxPages;
  const maybeRender = async (p: PageFacts, status: number): Promise<PageFacts> => {
    if (!render || p.wordCount >= THIN_WORDS || (out.rendered ?? 0) >= renderCap || signal.aborted || status >= 400) return p;
    out.rendered = (out.rendered ?? 0) + 1;
    const r = await render(p.url, signal).catch(() => null);
    if (!r) return p;
    const q = extractPage(r.html, p.url, status);
    if (q.wordCount <= p.wordCount) return p;
    q.type = p.type;
    q.rendered = true;
    return q;
  };

  // 1. Homepage (https first; http only when TLS itself fails).
  let home: Awaited<ReturnType<Fetcher>>;
  const start = slug ? storeOrigin(slug) + startPath : `https://${host}${startPath}`;
  try { home = await fetchOne(start); }
  catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    if (!slug && /CERT|SSL|TLS|SELF_SIGNED|EPROTO|ECONNREFUSED/i.test(code)) {
      try { home = await fetchOne(`http://${host}${startPath}`); }
      catch (e2) { out.error = (e2 as Error).message.slice(0, 120); out.ms = Date.now() - t0; return out; }
    } else {
      out.error = code === "ENOTFOUND" ? "domain does not resolve (DNS)" : signal.aborted ? "timed out" : (e as Error).message.slice(0, 120);
      out.ms = Date.now() - t0;
      return out;
    }
  }
  const homeUrl = new URL(home.url);
  out.origin = homeUrl.origin;
  out.finalHost = homeUrl.host.replace(/^www\./, "");
  out.https = homeUrl.protocol === "https:";
  out.redirectedOffsite = !slug && registrable(homeUrl.hostname.replace(/^www\./, "")) !== registrable(host.replace(/:\d+$/, ""));
  let homePage = extractPage(home.body, home.url, home.status);
  homePage.type = "home";
  const homePath = homeUrl.pathname.replace(/index\.html?$/, "");
  out.botBlocked = home.status === 403 || home.status === 429 || home.status === 503 || (BLOCK_RE.test(homePage.title) && homePage.wordCount < 400);
  if (!out.botBlocked) homePage = await maybeRender(homePage, home.status);
  out.pages.push(homePage);
  opts.onPage?.(homePage, 1);

  // 2. robots.txt + sitemap
  try {
    const r = await fetchOne(`${out.origin}/robots.txt`);
    if (r.status === 200 && !isHtml(r)) { out.robots = { found: true, ...parseRobots(r.body) }; }
  } catch { /* none */ }
  const keyOf = (u: URL) => (u.origin + u.pathname.replace(/\/index\.html?$/, "/") + u.search).replace(/\/$/, "");
  const seen = new Set<string>([keyOf(homeUrl), out.origin]);
  const siteName = (h: string) => h.replace(/^www\./, "");
  const queue = new Map<string, { url: string; type: PageType; score: number }>();
  const offer = (url: string, anchor = "") => {
    let u: URL;
    try { u = new URL(url, out.origin); } catch { return; }
    u.hash = "";
    // Same site over http/https or with/without www counts as the same site.
    if (siteName(u.hostname) !== siteName(homeUrl.hostname) || (u.port || "") !== (homeUrl.port || "")) return;
    if (u.origin !== out.origin) u = new URL(u.pathname + u.search, out.origin);
    // A shop that lives under a path (scrapeme.live/shop/) is crawled within that path, plus its site-wide policy pages.
    const inScope = homePath === "/" || u.pathname.startsWith(homePath) || classify(u.pathname, "", anchor) !== "other" && classify(u.pathname, "", anchor) !== "product";
    const key = keyOf(u);
    if (!inScope || seen.has(key) || queue.has(key) || SKIP.test(u.pathname + u.search)) return;
    if (!robotsAllows(u.pathname, out.robots.disallow) && out.robotsHidden!.length < 10 && !out.robotsHidden!.includes(u.pathname)) out.robotsHidden!.push(u.pathname);
    const type = classify(u.pathname, "", anchor);
    queue.set(key, { url: u.toString(), type, score: PRIORITY[type] - u.pathname.split("/").length });
  };
  for (const l of homePage.internalLinks) offer(l.url, l.text);
  const sitemapUrl = out.robots.sitemaps.find((s) => { try { return new URL(s, out.origin).origin === out.origin; } catch { return false; } }) ?? `${out.origin}/sitemap.xml`;
  try {
    const r = await fetchOne(new URL(sitemapUrl, out.origin).toString());
    if (r.status === 200 && /<(urlset|sitemapindex)/i.test(r.body)) {
      const locs = [...r.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).slice(0, 300);
      out.sitemapUrls = locs.length;
      for (const l of locs) offer(l);
    }
  } catch { /* none */ }

  // 3. Best-first crawl: highest-priority page types first, a cap per type, links discovered on the way are queued too.
  const perType = new Map<PageType, number>();
  const nextBatch = () => {
    const picks: { url: string; type: PageType }[] = [];
    const sorted = [...queue.entries()].sort((a, b) => b[1].score - a[1].score);
    for (const [key, c] of sorted) {
      if (picks.length >= conc || out.pages.length + picks.length >= maxPages) break;
      const cap = CAP[c.type] ?? 1;
      if ((perType.get(c.type) ?? 0) >= cap) { queue.delete(key); continue; }
      perType.set(c.type, (perType.get(c.type) ?? 0) + 1);
      queue.delete(key);
      seen.add(key);
      picks.push(c);
    }
    return picks;
  };
  while (out.pages.length < maxPages && !signal.aborted) {
    const batch = nextBatch();
    if (!batch.length) break;
    await Promise.all(batch.map(async (c) => {
      try {
        const r = await fetchOne(c.url);
        if (!r.body || !isHtml(r)) { out.failed.push({ url: c.url, error: `${r.status} non-HTML` }); return; }
        let p = extractPage(r.body, r.url, r.status);
        if (p.type === "other" || p.type === "home") p.type = c.type;
        p = await maybeRender(p, r.status);
        out.pages.push(p);
        opts.onPage?.(p, out.pages.length);
        for (const l of p.internalLinks) offer(l.url, l.text);
      } catch (e) { out.failed.push({ url: c.url, error: (e as Error).message.slice(0, 80) }); }
    }));
  }
  out.candidates = queue.size + out.pages.length + out.failed.length;
  out.ms = Date.now() - t0;
  return out;
}
