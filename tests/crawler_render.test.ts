import { describe, expect, it, afterEach } from "vitest";
import { crawlSite, THIN_WORDS } from "@/lib/scan/crawl";
import { embeddedData, extractPage } from "@/lib/scan/extract";
import { basicCheck } from "@/lib/scan/basic";
import { PRIVATE_URL_PATTERNS, renderConfig, renderPage } from "@/lib/scan/render";
import type { Fetcher } from "@/lib/scan/net";
import type { SiteIntel } from "@/lib/scan/intel";

/** In-memory website: path → HTML (or plain text for robots.txt). */
function site(pages: Record<string, string>): { fetcher: Fetcher; hits: string[] } {
  const hits: string[] = [];
  const fetcher: Fetcher = async (url) => {
    const u = new URL(url);
    hits.push(u.pathname);
    const body = pages[u.pathname];
    if (body === undefined) return { status: 404, headers: { "content-type": "text/html" }, body: "<html><title>Not found</title></html>", url, hops: [] };
    const type = u.pathname.endsWith(".txt") ? "text/plain" : u.pathname.endsWith(".xml") ? "application/xml" : "text/html";
    return { status: 200, headers: { "content-type": type }, body, url, hops: [] };
  };
  return { fetcher, hits };
}

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
const intel = (ageDays: number | null): SiteIntel => ({
  domain: "newshop.com", allowlisted: false,
  registration: { createdAt: null, ageDays, expiresAt: null, registrar: null, source: "rdap", brandCloneOf: null },
  tls: { ok: true, issuer: "Test CA", validFrom: null, validTo: null, ageDays: 10 },
  dns: { mx: 1, ns: [] }, wayback: { firstSeen: null, years: 0, source: "none" },
} as unknown as SiteIntel);

afterEach(() => { delete process.env.RENDER_URL; delete process.env.RENDER_ENABLED; });

describe("robots.txt no longer blocks a user-requested check", () => {
  it("reads disallowed policy pages anyway, records them, and the basic check notes it for a young site", async () => {
    const { fetcher, hits } = site({
      "/": `<html><title>New Shop</title><body><p>${words(80)}</p><a href="/refund-policy">Refunds</a><a href="/terms">Terms</a><a href="/contact">Contact</a></body></html>`,
      "/robots.txt": "User-agent: *\nDisallow: /refund-policy\nDisallow: /terms\n",
      "/refund-policy": `<html><title>Refund policy</title><body><p>All sales are final. ${words(70)}</p></body></html>`,
      "/terms": `<html><title>Terms</title><body><p>${words(70)}</p></body></html>`,
      "/contact": `<html><title>Contact</title><body><p>${words(70)}</p></body></html>`,
    });
    const c = await crawlSite("newshop.com", { fetcher, render: false });
    expect(hits).toContain("/refund-policy");
    expect(hits).toContain("/terms");
    expect(c.pages.map((p) => p.path)).toEqual(expect.arrayContaining(["/refund-policy", "/terms", "/contact"]));
    expect(c.skippedByRobots).toEqual([]);
    expect(c.robotsHidden).toEqual(expect.arrayContaining(["/refund-policy", "/terms"]));
    const report = basicCheck(c, intel(20));
    expect(report.findings.find((f) => f.id === "robots_hides_policies")?.detail).toMatch(/Bluff read them anyway/);
    // an established site isn't penalized for the same robots.txt
    expect(basicCheck(c, intel(4000)).findings.some((f) => f.id === "robots_hides_policies")).toBe(false);
  });
});

describe("headless fallback for JavaScript-built pages", () => {
  const shell = `<html><title>Shop</title><body><div id="root"></div><script src="/app.js"></script></body></html>`;
  const renderedHtml = `<html><title>Shop</title><body><h1>Retro Runner 85% off</h1><p>${words(120)}</p><a href="/contact">Contact</a></body></html>`;

  it("renders only thin pages, uses the richer result, and marks it", async () => {
    const { fetcher } = site({ "/": shell, "/contact": `<html><title>Contact</title><body><p>${words(90)}</p></body></html>` });
    const rendered: string[] = [];
    const c = await crawlSite("jsshop.com", { fetcher, render: async (url) => { rendered.push(new URL(url).pathname); return { html: renderedHtml, ms: 5 }; } });
    expect(rendered).toEqual(["/"]); // /contact had enough text: not rendered
    expect(c.pages[0].rendered).toBe(true);
    expect(c.pages[0].wordCount).toBeGreaterThan(THIN_WORDS);
    expect(c.pages.some((p) => p.path === "/contact")).toBe(true); // link found only in the rendered DOM
    expect(c.rendered).toBe(1);
    expect(basicCheck(c, intel(20)).findings.some((f) => f.id === "rendered")).toBe(true);
  });

  it("keeps the plain HTML when the renderer fails or returns less", async () => {
    const { fetcher } = site({ "/": shell });
    const c = await crawlSite("jsshop.com", { fetcher, render: async () => null });
    expect(c.pages[0].rendered).toBeUndefined();
    expect(basicCheck(c, intel(20)).findings.some((f) => f.id === "thin_content")).toBe(true);
  });

  it("is off without RENDER_URL and never renders private or bare-IP targets", async () => {
    expect(renderConfig().enabled).toBe(false);
    expect(await renderPage("https://example.com/")).toBeNull();
    process.env.RENDER_URL = "http://render:3000";
    let called = false;
    const spy = (async () => { called = true; return new Response("<html>" + words(100) + "</html>"); }) as unknown as typeof fetch;
    expect(await renderPage("http://127.0.0.1/", undefined, spy)).toBeNull();
    expect(await renderPage("http://169.254.169.254/latest/meta-data", undefined, spy)).toBeNull();
    expect(await renderPage("http://localhost:3000/", undefined, spy)).toBeNull();
    expect(called).toBe(false);
    const blocked = ["http://10.0.0.5/", "http://169.254.169.254/", "http://192.168.1.1/", "http://172.20.0.3/", "http://localhost/", "http://[::1]/", "file:///etc/passwd"];
    for (const u of blocked) expect(PRIVATE_URL_PATTERNS.some((p) => new RegExp(p).test(u)), u).toBe(true);
    expect(PRIVATE_URL_PATTERNS.some((p) => new RegExp(p).test("https://fastkicks-shop.bluffai.us/"))).toBe(false);
  });
});

describe("structured data in the page HTML", () => {
  it("reads JSON-LD organization, address and product prices, plus OpenGraph and Next.js page state", () => {
    const html = `<html><head><title>X</title>
      <meta property="og:site_name" content="Volt Deals">
      <script type="application/ld+json">{"@context":"https://schema.org","@graph":[
        {"@type":"Organization","name":"Volt Deals LLC","telephone":"+1 214 555 0100","email":"help@voltdeals.example","foundingDate":"2016",
         "address":{"@type":"PostalAddress","streetAddress":"1 Main St Suite 0","addressLocality":"Dallas","addressRegion":"TX","postalCode":"75201"}},
        {"@type":"Product","name":"GameStation 5","offers":{"@type":"Offer","price":"189.00"}}]}</script>
      <script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"blurb":"Free returns within 90 days on every order","code":"function(){return 1}"}}}</script>
      </head><body><div id="__next"></div></body></html>`;
    const e = embeddedData(html);
    expect(e.sources).toEqual(["json-ld", "opengraph", "next-data"]);
    expect(e.companies).toContain("Volt Deals LLC");
    expect(e.addresses[0]).toMatch(/Suite 0, Dallas, TX, 75201/);
    expect(e.prices).toContain(189);
    expect(e.text).toMatch(/founded 2016/);
    expect(e.text).toMatch(/Free returns within 90 days/);
    expect(e.text).not.toMatch(/function/);
    const p = extractPage(html, "https://voltdeals.example/");
    expect(p.embedded).toEqual(["json-ld", "opengraph", "next-data"]);
    expect(p.text).toMatch(/\[Structured page data\]/);
    expect(p.phones).toContain("+1 214 555 0100");
    expect(p.wordCount).toBeLessThan(THIN_WORDS); // visible words only
  });

  it("ignores malformed JSON-LD", () => {
    expect(embeddedData(`<script type="application/ld+json">{not json</script>`).sources).toEqual([]);
  });
});

describe("renderer deployment", () => {
  it("compose runs the pinned renderer on its own fixed subnet, unexposed, and wires web to it", async () => {
    const fs = await import("node:fs");
    const y = fs.readFileSync("docker-compose.yml", "utf8");
    const render = y.slice(y.indexOf("\n  render:"), y.indexOf("\n  tools:"));
    expect(render).toMatch(/browserless\/chromium@sha256:[0-9a-f]{64}/);
    expect(render).not.toMatch(/ports:/);
    expect(render).toMatch(/mem_limit: 1g/);
    expect(y).toMatch(/RENDER_URL: http:\/\/render:3000/);
    expect(y).toMatch(/subnet: 172\.30\.99\.0\/24/);
    expect(fs.readFileSync("scripts/deploy/render-firewall.sh", "utf8")).toContain("172.30.99.0/24");
  });
});
