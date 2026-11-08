import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isBlockedIp, guardedFetch } from "@/lib/scan/net";
import { diskFetcher } from "./diskFetcher";
import { crawlSite, parseRobots, robotsAllows, splitWebsite } from "@/lib/scan/crawl";
import { extractPage, classify } from "@/lib/scan/extract";
import { basicCheck, basicVerdict } from "@/lib/scan/basic";
import type { SiteIntel } from "@/lib/scan/intel";
import { registrableDomain } from "@/lib/scan/intel";
import { mapDemoHost, ownStoreSlug, loopbackAllowedFor } from "@/lib/scan/stores";
import { resolveWebsite, websiteFromText } from "@/lib/scan/website";
import { descriptorFrom } from "@/lib/nessie/sync";
import { normalizeVerdictArgs, submitVerdict } from "@/lib/agent/tools/submitVerdict";
import { openAiTools } from "@/lib/agent/tools";
import { allocate, siteData, SITE_DATA_TEXT_CHARS } from "@/lib/scan/dossier";
import { pageCrawlTarget } from "@/lib/scan/site";
import type { SiteScan } from "@/lib/scan/store";
import { detectColumns, keepVerbatim, parseCsv, parseDataset, parseItems, ruleFlags, toMessages } from "@/lib/tmobile";
import { pickDaily } from "@/lib/game";
import { NESSIE_SEED, purchaseDescription } from "@/data/nessieSeed";
import { STORES, SITE_SLUGS } from "@/data/stores";

const demoIntel = (ageDays: number | null, extra: Partial<SiteIntel> = {}): SiteIntel => ({
  domain: "x.demo", allowlisted: false, registration: { createdAt: ageDays == null ? null : new Date(Date.now() - ageDays * 86_400_000).toISOString(), ageDays, expiresAt: null, registrar: "QuickReg Inc", source: "demo_registry", brandCloneOf: null },
  tls: { ok: false, issuer: null, validFrom: null, validTo: null, ageDays: null }, dns: { mx: 0, ns: [] }, wayback: { firstSeen: null, years: 0, source: "none" }, ...extra,
});

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"])("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));
  it.each(["8.8.8.8", "151.101.1.1", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
  it("refuses bare IPs, odd ports and non-http schemes before connecting", async () => {
    const sig = AbortSignal.timeout(2000);
    await expect(guardedFetch("http://127.0.0.1/", sig)).rejects.toThrow(/bare IP/);
    await expect(guardedFetch("http://example.com:8080/", sig)).rejects.toThrow(/port/);
    await expect(guardedFetch("file:///etc/passwd", sig)).rejects.toThrow(/refusing/);
  });
  it("loopback is allowed only for our own storefront hosts on the dev port", () => {
    expect(loopbackAllowedFor("fastkicks-shop.localhost", "3000")).toBe(true);
    expect(loopbackAllowedFor("fastkicks-shop.localhost", "5432")).toBe(false);
    expect(loopbackAllowedFor("evil.localhost", "3000")).toBe(false);
  });
});

describe("demo storefront hosts", () => {
  it("maps statement pseudo-domains to this deployment and back", () => {
    expect(mapDemoHost("fastkicks-shop.demo")).toBe("fastkicks-shop.localhost:3000");
    expect(mapDemoHost("netflix.com")).toBe("netflix.com");
    expect(ownStoreSlug("voltdeals-outlet.localhost:3000")).toBe("voltdeals-outlet");
    expect(ownStoreSlug("voltdeals-outlet.com")).toBeNull();
  });
  it("statement lines resolve to a website (with path when the shop lives under one)", () => {
    for (const m of NESSIE_SEED) expect(websiteFromText(purchaseDescription(m)), m.key).toBeTruthy();
    expect(websiteFromText("SCRAPEME LIVE · scrapeme.live/shop")).toBe("scrapeme.live/shop/");
    expect(websiteFromText("FKSHP*LLC · fastkicks-shop.demo")).toBe("fastkicks-shop.localhost:3000");
    expect(splitWebsite("scrapeme.live/shop/")).toEqual({ host: "scrapeme.live", path: "/shop/" });
    expect(descriptorFrom(purchaseDescription(NESSIE_SEED[0]), "Netflix")).toBe("NETFLIX.COM");
    expect(registrableDomain("www.shop.example.co.uk")).toBe("example.co.uk");
  });
  it("keeps only DNS-resolvable guesses", async () => {
    const ok = await resolveWebsite({ merchant: "Whataburger", descriptor: "WHATABURGER 1144" }, async (h) => { if (h !== "whataburger.com") throw new Error("nx"); return {} as never; });
    expect(ok).toMatchObject({ host: "whataburger.com", how: "guessed" });
    expect((await resolveWebsite({ merchant: "Zzq" }, async () => { throw new Error("nx"); })).host).toBeNull();
  });
  it("every site page is labeled, noindexed, self-contained, and never submits", () => {
    for (const slug of SITE_SLUGS) {
      const dir = path.join(process.cwd(), "stores", slug);
      const files = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith(".html"));
      expect(files.length, slug).toBeGreaterThanOrEqual(4);
      for (const f of files) {
        const html = fs.readFileSync(path.join(dir, f), "utf8");
        expect(html, `${slug}/${f}`).toContain("Demo store, not real");
        expect(html).toContain('name="robots" content="noindex');
        expect(html).not.toMatch(/(src|href)="https?:\/\//i);
        expect(html).not.toMatch(/<form[^>]*\saction=/i);
      }
    }
  });
});

describe("crawler + extraction", () => {
  it("robots.txt rules", () => {
    const r = parseRobots("User-agent: Googlebot\nDisallow: /g\n\nUser-agent: *\nDisallow: /account\nDisallow: /*?add-to-cart=\nSitemap: https://x.com/s.xml");
    expect(r.disallow).toEqual(["/account", "/*?add-to-cart="]);
    expect(r.sitemaps).toEqual(["https://x.com/s.xml"]);
    expect(robotsAllows("/account/orders", r.disallow)).toBe(false);
    expect(robotsAllows("/refund", r.disallow)).toBe(true);
  });
  it("classifies pages by path", () => {
    expect(classify("/refund-policy.html")).toBe("refund");
    expect(classify("/catalogue/category/books/self-help_41/index.html")).not.toBe("faq");
    expect(classify("/")).toBe("home");
  });
  it("ignores our own demo labels when reading a page", () => {
    const p = extractPage('<title>x</title><p class="demo" data-demo-label>Demo store, not real.</p><p>Hello</p>', "http://a.localhost:3000/");
    expect(p.text).not.toContain("Demo store");
    expect(p.selfDescribedDemo).toBe(false);
  });
  it("finds the traps on VoltDeals' inner pages, policy pages first", async () => {
    const c = await crawlSite("voltdeals-outlet.localhost:3000", { fetcher: diskFetcher });
    expect(c.error).toBeUndefined();
    expect(c.pages.length).toBeGreaterThanOrEqual(8);
    expect(c.pages.slice(1, 4).map((p) => p.type)).toEqual(expect.arrayContaining(["refund"]));
    const flags = c.pages.flatMap((p) => p.policyFlags.map((f) => f.id));
    expect(flags).toEqual(expect.arrayContaining(["store_credit_only", "restocking_fee", "overseas_returns", "card_unavailable"]));
    expect(c.pages.flatMap((p) => p.companyNames)).toEqual(expect.arrayContaining(["Brightway Trading Co., Ltd.", "VoltDeals LLC"]));
  });
});

describe("basic check (rules only)", () => {
  it.each(SITE_SLUGS.map((s) => [s]))("%s scores as a scam from its crawl + registry age", async (slug) => {
    const c = await crawlSite(`${slug}.localhost:3000`, { fetcher: diskFetcher });
    const age = STORES.find((s) => s.slug === slug)!.ageDays;
    const r = basicCheck(c, demoIntel(age), { priorCharges: 0 });
    expect(r.label).toBe("likely_scam");
    expect(r.findings.some((f) => f.severity === "high")).toBe(true);
    const v = basicVerdict(r);
    expect(v.mode).toBe("basic");
    expect(v.evidence.length).toBeGreaterThanOrEqual(3);
  });
  it("a long-established merchant with clean pages looks OK", () => {
    const home = extractPage('<title>Shop</title><a href="/contact">Contact</a><a href="/returns">Returns</a><a href="/privacy">Privacy</a><p>help@shop.com</p>', "https://shop.com/");
    const crawl = { host: "shop.com", origin: "https://shop.com", finalHost: "shop.com", https: true, redirectedOffsite: false, botBlocked: false, ms: 1, robots: { found: true, disallow: [], sitemaps: [] }, sitemapUrls: 0, candidates: 1, pages: [home, { ...home, type: "contact" as const }], failed: [], skippedByRobots: [], ownStore: null };
    const r = basicCheck(crawl, demoIntel(9000, { allowlisted: true, tls: { ok: true, issuer: "DigiCert", validFrom: null, validTo: null, ageDays: 30 }, wayback: { firstSeen: "1999-01-01", years: 27, source: "archive.org" } }), { priorCharges: 3 });
    expect(r.label).toBe("looks_ok");
    expect(r.score).toBeGreaterThanOrEqual(85);
  });
});

describe("deep review plumbing", () => {
  it("site runs get only the deep-review tools; other modes never see them", () => {
    const site = openAiTools("site").map((t) => t.function.name);
    expect(site.sort()).toEqual(["fetch_page", "read_page", "submit_verdict", "txn_search"]);
    expect(openAiTools("page_site").map((t) => t.function.name).sort()).toEqual(["fetch_page", "read_page", "submit_verdict"]);
    expect(openAiTools("page").map((t) => t.function.name)).not.toContain("read_page");
  });
  it("summary + findings become the verdict's analysis; basic evidence counts toward confidence", () => {
    const args = { score: 15, verdict: "likely_scam", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: ["gift_card_only"], next_steps: ["x", "y"],
      summary: "This store steers buyers to Zelle and only refunds as store credit.", findings: [{ title: "Store credit only", detail: "Refund page", severity: "high", page: "/refund-policy.html" }, { nope: 1 }] };
    const r = submitVerdict(args, "live", ["domain_age_lt_30", "too_good_discount", "brand_clone"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.verdict.analysis?.findings).toHaveLength(1);
      expect(r.verdict.analysis?.summary).toContain("Zelle");
      expect(r.verdict.verdict).toBe("likely_scam");
      expect(r.verdict.confidence).toBeGreaterThan(0.6);
    }
  });
  it("tolerates harmless shape quirks but not missing content", () => {
    const base = { score: 20, verdict: "likely_scam", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: ["domain_age_lt_30", "gift_card_only", "brand_clone", "countdown_timer"], next_steps: ["x", "y"] };
    expect(submitVerdict({ ...base, linked: { exposure_id: null }, evidence: ["1", "2", "3", "4", "5", "6"] }).ok).toBe(true);
    expect(submitVerdict({ ...base, evidence: ["one"] }).ok).toBe(false);
    expect(normalizeVerdictArgs({ score: "42" })).toMatchObject({ score: 42 });
  });
});

describe("website data sent to Nemotron", () => {
  const scanOf = async (slug: string): Promise<SiteScan> => {
    const crawl = await crawlSite(`${slug}.localhost:3000`, { fetcher: diskFetcher });
    const intel = demoIntel(STORES.find((s) => s.slug === slug)!.ageDays);
    return { id: "00000000-0000-4000-8000-00000000d0d0", host: `${slug}.localhost:3000`, merchant: slug, crawl, intel, basic: basicCheck(crawl, intel), createdAt: new Date().toISOString() };
  };

  it("carries every crawled page's text, the registry facts and the basic check, decisive pages first", async () => {
    const s = await scanOf("voltdeals-outlet");
    const d = siteData(s);
    expect(d.pages).toHaveLength(s.crawl.pages.length);
    expect(d.pages[0].type).toBe("home");
    expect(d.pages.map((p) => p.type).indexOf("refund")).toBeLessThan(d.pages.map((p) => p.type).indexOf("privacy"));
    const refund = d.pages.find((p) => p.type === "refund")!;
    expect(refund.text.toLowerCase()).toContain("store credit");
    expect(refund.policy_quotes?.length).toBeGreaterThan(0);
    expect(d.registry.domain_age_days).toBe(21);
    expect(d.basic_check.score).toBe(s.basic.score);
    expect(d.basic_check.findings.length).toBeGreaterThan(0);
    expect(d.demo_storefront).toBe(true);
    expect(d.note).toMatch(/untrusted/);
    // the page text stays within the budget; the whole payload stays a few thousand tokens
    expect(d.pages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(SITE_DATA_TEXT_CHARS);
    expect(JSON.stringify(d).length).toBeLessThan(30_000);
  });

  it("short pages keep all their text; long ones share the rest and say they were cut", async () => {
    expect(allocate([100, 5000, 5000], 3100)).toEqual([100, 1500, 1500]);
    expect(allocate([10, 20], 1000)).toEqual([10, 20]);
    expect(allocate([0, 50], 10)).toEqual([0, 10]);
    const d = siteData(await scanOf("voltdeals-outlet"), 600);
    expect(d.pages.some((p) => p.truncated)).toBe(true);
    expect(d.pages.reduce((n, p) => n + p.text.length, 0)).toBeLessThanOrEqual(600);
  });

  it("page checks crawl the site itself: demo stores map to this deployment, other hosts must look like domains", () => {
    expect(pageCrawlTarget("fastkicks-shop")).toBe("fastkicks-shop.localhost:3000");
    expect(pageCrawlTarget("fastkicks-shop.localhost")).toBe("fastkicks-shop.localhost:3000");
    expect(pageCrawlTarget("https://www.Example-Store.com/checkout?session=abc")).toBe("example-store.com");
    expect(pageCrawlTarget("shop.example.co.uk:443")).toBe("shop.example.co.uk");
    expect(pageCrawlTarget("localhost")).toBeNull();
    expect(pageCrawlTarget("not a host")).toBeNull();
    expect(pageCrawlTarget("")).toBeNull();
  });
});

describe("message dataset import", () => {
  it("parses CSV and auto-detects columns", () => {
    const rows = parseCsv('id,message,label,scam_type\n1,"Pay $1.99 fee, now: x.top",smishing,delivery\n2,"Your order is ready",ham,\n3,"",spam,x\n');
    const cols = detectColumns(rows);
    expect(cols).toMatchObject({ text: "message", label: "label", category: "scam_type", id: "id" });
    const { messages, skipped } = toMessages(rows, cols);
    expect(skipped).toBe(1);
    expect(messages.map((m) => [m.isScam, m.category])).toEqual([[true, "delivery"], [false, "legit_transactional"]]);
  });
  it("reads JSON, wrapped JSON and JSONL; keeps only verbatim flags", () => {
    expect(parseDataset('[{"text":"a","label":"scam"}]', "f.json")).toHaveLength(1);
    expect(parseDataset('{"messages":[{"text":"a","label":"scam"}]}', "f.json")).toHaveLength(1);
    expect(parseDataset('{"text":"a"}\n{"text":"b"}\n', "f.jsonl")).toHaveLength(2);
    const text = "Final notice: pay $2 redelivery fee at parcel-fix.top";
    expect(keepVerbatim(text, [{ span: "Final notice", why: "x" }, { span: "made up", why: "y" }])).toEqual([{ span: "Final notice", why: "x" }]);
    expect(parseItems('[{"i":0,"red_flags":[]}]')).toHaveLength(1);
    for (const f of ruleFlags(text)) expect(text).toContain(f.span);
  });
});

describe("daily set source preference", () => {
  const card = (id: string, source: string, is_scam: boolean, extra: Record<string, unknown> = {}) => ({ id, source, is_scam, kind: "text", content: { body: id }, red_flags: [], category: id, origin: null, difficulty: "medium", ...extra });
  it("bank-scan cards (per user) never enter the shared daily set; dataset cards fill it", () => {
    const pool = [card("b1", "bank", true, { user_id: "u1" }), card("b2", "bank", false), ...Array.from({ length: 12 }, (_, i) => card(`t${i}`, "dataset", i % 2 === 0))];
    for (const day of ["2026-11-07", "2026-11-08", "2026-11-09"]) {
      const out = pickDaily(pool as never, day);
      expect(out).toHaveLength(5);
      expect(out.filter((c) => c.source === "bank")).toHaveLength(0);
      expect(out.filter((c) => c.is_scam).length).toBeGreaterThanOrEqual(2);
    }
  });
});
