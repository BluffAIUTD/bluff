import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isBlockedIp, guardedFetch, type Fetcher } from "@/lib/scan/net";
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
import { detectColumns, keepVerbatim, parseCsv, parseDataset, parseItems, ruleFlags, toMessages } from "@/lib/tmobile";
import { preferSources } from "@/lib/game";
import { NESSIE_SEED, purchaseDescription } from "@/data/nessieSeed";
import { STORES, SITE_SLUGS } from "@/data/stores";

/** Serves stores/<slug>/ from disk for <slug>.localhost:3000 URLs: crawler tests run offline. */
const diskFetcher: Fetcher = async (url) => {
  const u = new URL(url);
  const slug = u.hostname.split(".")[0];
  let file = path.join(process.cwd(), "stores", slug, u.pathname);
  if (u.pathname.endsWith("/")) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) return { status: 404, headers: { "content-type": "text/html" }, body: "<title>Not found</title>", url, hops: [] };
  const type = file.endsWith(".html") ? "text/html" : file.endsWith(".xml") ? "application/xml" : "text/plain";
  return { status: 200, headers: { "content-type": type }, body: fs.readFileSync(file, "utf8"), url, hops: [] };
};
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
    expect(site.sort()).toEqual(["fetch_page", "read_page", "site_overview", "submit_verdict", "txn_search"]);
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
  const card = (id: string, source: string, is_scam: boolean) => ({ id, source, is_scam, kind: "text", content: { body: id }, red_flags: [], category: "c", origin: null });
  it("bank card + dataset cards replace seeded ones with the same answer", () => {
    const picks = [card("s1", "seed", true), card("s2", "seed", true), card("s3", "seed", false), card("s4", "seed", false), card("s5", "seed", false)];
    const pool = [...picks, card("b1", "bank", true), ...Array.from({ length: 6 }, (_, i) => card(`t${i}`, "dataset", i % 2 === 0))];
    const out = preferSources(picks as never, pool as never, "2026-11-07");
    expect(out.filter((c) => c.source === "bank")).toHaveLength(1);
    expect(out.filter((c) => c.source === "dataset")).toHaveLength(3);
    expect(out.filter((c) => c.is_scam)).toHaveLength(2);
  });
});
