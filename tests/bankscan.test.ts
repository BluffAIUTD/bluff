import { describe, expect, it } from "vitest";
import { isBlockedIp, factsFromHtml, scrapeSite } from "@/lib/scan/scrape";
import { demoStoreFor, resolveWebsite, websiteFromText } from "@/lib/scan/website";
import { siteKeys } from "@/lib/scan/rules";
import { descriptorFrom } from "@/lib/nessie/sync";
import { normalizeVerdictArgs, submitVerdict } from "@/lib/agent/tools/submitVerdict";
import { scrapeSiteTool, resolveWebsiteTool } from "@/lib/agent/tools/scrapeSite";
import { openAiTools } from "@/lib/agent/tools";
import { readStoreHtml } from "@/lib/agent/tools/pageSignals";
import { detectColumns, keepVerbatim, parseCsv, parseDataset, parseItems, ruleFlags, toMessages } from "@/lib/tmobile";
import { preferSources } from "@/lib/game";
import { NESSIE_SEED, purchaseDescription } from "@/data/nessieSeed";

describe("SSRF guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1"])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });
  it.each(["8.8.8.8", "151.101.1.1", "172.32.0.1", "2606:4700::1111"])("allows %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
  it("refuses reserved/internal hostnames without any network call", async () => {
    for (const h of ["localhost", "metadata.google.internal", "printer.local", "nothing-here.example"]) {
      const r = await scrapeSite(h);
      expect(r.fetched).toBe(false);
    }
  });
});

describe("website resolution", () => {
  it("reads the domain off a statement line", () => {
    expect(websiteFromText("NETFLIX.COM · netflix.com")).toBe("netflix.com");
    expect(websiteFromText("FKSHP*LLC · fastkicks-shop.example")).toBe("fastkicks-shop.example");
    expect(websiteFromText("STARBUCKS STORE 08812")).toBeNull();
    expect(websiteFromText("ACME CO.LLC")).toBeNull();
  });
  it("maps .example demo hosts to bundled storefronts only", () => {
    expect(demoStoreFor("fastkicks-shop.example")).toBe("fastkicks-shop");
    expect(demoStoreFor("fastkicks-shop.com")).toBeNull();
    expect(demoStoreFor("random.example")).toBeNull();
  });
  it("prefers the statement website and only keeps guesses that resolve", async () => {
    expect((await resolveWebsite({ merchant: "X", website: "Target.com" })).host).toBe("target.com");
    const ok = await resolveWebsite({ merchant: "Whataburger", descriptor: "WHATABURGER 1144" }, async (h) => { if (h !== "whataburger.com") throw new Error("nx"); return {} as never; });
    expect(ok).toMatchObject({ host: "whataburger.com", how: "guessed" });
    const none = await resolveWebsite({ merchant: "Zzq" }, async () => { throw new Error("nx"); });
    expect(none.host).toBeNull();
  });
  it("seed purchases always carry a resolvable website", () => {
    for (const m of NESSIE_SEED) expect(websiteFromText(purchaseDescription(m))).toBe(m.website);
    expect(descriptorFrom(purchaseDescription(NESSIE_SEED[0]), "Netflix")).toBe("NETFLIX.COM");
    expect(descriptorFrom(undefined, "Netflix")).toBe("Netflix");
  });
});

describe("site tools are pinned to the transaction's website", () => {
  const ctx = { userId: "u", db: {} as never, site: { host: "fastkicks-shop.example", merchant: "FastKicks LLC", descriptor: "FKSHP*LLC" } };
  it("scrape_site refuses any other host", async () => {
    expect(await scrapeSiteTool.run({ host: "fastkicks.com" }, ctx)).toMatchObject({ error: expect.stringContaining("fastkicks-shop.example") });
    expect(await scrapeSiteTool.run({ host: "fastkicks-shop.example" }, ctx)).toMatchObject({ fetched: true, source: "demo_store" });
  });
  it("resolve_website returns the statement website regardless of model arguments", async () => {
    expect(await resolveWebsiteTool.run({ merchant: "FastKicks" }, ctx)).toMatchObject({ host: "fastkicks-shop.example", how: "statement" });
  });
  it("site runs get only the site tools; other modes never see them", () => {
    const site = openAiTools("site").map((t) => t.function.name);
    expect(site).toEqual(expect.arrayContaining(["scrape_site", "resolve_website", "domain_intel", "submit_verdict"]));
    expect(site).not.toContain("notify");
    expect(openAiTools("page").map((t) => t.function.name)).not.toContain("scrape_site");
  });
});

describe("site evidence", () => {
  it("demo scam storefront yields strong scam keys", () => {
    const html = readStoreHtml("fastkicks-shop")!;
    const f = factsFromHtml(html, "fastkicks-shop", true);
    expect(f.signals.gift_card_or_crypto_only).toBe(true);
    const keys = siteKeys({ host: "fastkicks-shop.example", fetched: true, source: "demo_store", final_url: "", final_host: "fastkicks-shop.example", status: 200, https: true, redirected_offsite: false, bot_blocked: false, ms: 1, ...f },
      { age_days: 4, allowlisted: false, brand_clone_of: "x", tld_risk: false }, 0);
    expect(keys).toEqual(expect.arrayContaining(["gift_card_only", "domain_age_lt_30", "brand_clone"]));
  });
  it("established sites aren't penalized for missing homepage refund text; unreachable sites are cited", () => {
    const keys = siteKeys({ host: "a.com", fetched: true, source: "live", final_url: "", final_host: "a.com", status: 200, https: true, redirected_offsite: false, bot_blocked: false, ms: 1,
      ...factsFromHtml("<title>A</title><a href=/contact>Contact</a><a href=/privacy>Privacy</a>", "a", true) }, { age_days: 9000, allowlisted: true, brand_clone_of: null, tld_risk: false }, 3);
    expect(keys).not.toContain("no_refund_policy");
    expect(keys).toEqual(expect.arrayContaining(["allowlisted", "domain_age_gt_365", "known_merchant", "has_privacy_policy"]));
    expect(siteKeys({ host: "a.com", fetched: false, source: "live", error: "x", ms: 1 }, null, 0)).toContain("site_unreachable");
  });
});

describe("submit_verdict normalization", () => {
  const base = { score: 20, verdict: "likely_scam", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: ["domain_age_lt_30", "gift_card_only", "brand_clone", "countdown_timer"], next_steps: ["x", "y"] };
  it("accepts null linked fields and one line too many", () => {
    const r = submitVerdict({ ...base, linked: { exposure_id: null, txn_id: null }, evidence: ["1", "2", "3", "4", "5", "6"] });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.verdict.evidence).toHaveLength(5); expect(r.verdict.linked).toEqual({}); }
  });
  it("still rejects missing evidence and out-of-range scores", () => {
    expect(submitVerdict({ ...base, evidence: ["one"] }).ok).toBe(false);
    expect(submitVerdict({ ...base, score: 140 }).ok).toBe(false);
    expect(normalizeVerdictArgs({ score: "42" })).toMatchObject({ score: 42 });
  });
});

describe("T-Mobile dataset import", () => {
  it("parses quoted CSV and auto-detects columns", () => {
    const rows = parseCsv('id,message,label,scam_type\n1,"Pay $1.99 fee, now: x.top",smishing,delivery\n2,"Your order is ready",ham,\n3,"",spam,x\n');
    const cols = detectColumns(rows);
    expect(cols).toMatchObject({ text: "message", label: "label", category: "scam_type", id: "id" });
    const { messages, skipped } = toMessages(rows, cols);
    expect(skipped).toBe(1);
    expect(messages.map((m) => [m.isScam, m.category])).toEqual([[true, "delivery"], [false, "legit_transactional"]]);
  });
  it("reads JSON arrays, wrapped JSON and JSONL", () => {
    expect(parseDataset('[{"text":"a","label":"scam"}]', "f.json")).toHaveLength(1);
    expect(parseDataset('{"messages":[{"text":"a","label":"scam"}]}', "f.json")).toHaveLength(1);
    expect(parseDataset('{"text":"a","label":"scam"}\n{"text":"b","label":"legit"}\n', "f.jsonl")).toHaveLength(2);
  });
  it("keeps only verbatim red flags and parses both model reply shapes", () => {
    const text = "Final notice: pay $2 redelivery fee at parcel-fix.top";
    expect(keepVerbatim(text, [{ span: "Final notice", why: "x" }, { span: "made up", why: "y" }])).toEqual([{ span: "Final notice", why: "x" }]);
    expect(parseItems('[{"i":0,"red_flags":[]}]')).toHaveLength(1);
    expect(parseItems('```json\n{"items":[{"i":1,"red_flags":[]}]}\n```')).toHaveLength(1);
    const rf = ruleFlags(text);
    expect(rf.length).toBeGreaterThan(0);
    for (const f of rf) expect(text).toContain(f.span);
  });
});

describe("daily set source preference", () => {
  const card = (id: string, source: string, is_scam: boolean) => ({ id, source, is_scam, kind: "text", content: { body: id }, red_flags: [], category: "c", origin: null });
  it("puts the bank card and up to 3 T-Mobile cards in, keeping the scam/legit mix", () => {
    const picks = [card("s1", "seed", true), card("s2", "seed", true), card("s3", "seed", false), card("s4", "seed", false), card("s5", "seed", false)];
    const pool = [...picks, card("b1", "bank", true), ...Array.from({ length: 6 }, (_, i) => card(`t${i}`, "tmobile", i % 2 === 0))];
    const out = preferSources(picks as never, pool as never, "2026-11-07");
    expect(out).toHaveLength(5);
    expect(out.filter((c) => c.source === "bank")).toHaveLength(1);
    expect(out.filter((c) => c.source === "tmobile")).toHaveLength(3);
    expect(out.filter((c) => c.is_scam)).toHaveLength(2);
    expect(preferSources(picks as never, pool as never, "2026-11-07").map((c) => c.id)).toEqual(out.map((c) => c.id));
  });
});
