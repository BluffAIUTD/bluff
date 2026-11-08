import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../../tests/testdb";
import { MAYA_ID } from "../../config";
import { domainIntel, rdapAgeDays } from "./domainIntel";
import { extractSignalsFromHtml, demoSlugFor, pageSignals } from "./pageSignals";
import { taxonomyMatch, keywordMatch, cosine } from "./taxonomyMatch";
import { exposureLookup } from "./exposureLookup";
import { txnSearch } from "./txnSearch";
import { submitVerdict } from "./submitVerdict";
import { capJson } from "./types";
import { runTool, TOOLS, openAiTools, BY_KIND } from "./index";
import { normalizeDescriptor } from "../../linker/normalize";

const NOW = new Date("2026-11-07T18:00:00Z");
let t: Awaited<ReturnType<typeof createTestDb>>;
const ctx = () => ({ userId: MAYA_ID, db: t.pool, now: NOW, baseDomain: "bluff.example.com" });

beforeAll(async () => { t = await createTestDb("bluff_tools_test", { seed: true, now: NOW }); });
afterAll(async () => { await t.drop(); });

describe("domain_intel", () => {
  it("reads the mock registry for demo hosts (subdomain of the base domain)", async () => {
    const r = await domainIntel("fastkicks-shop.bluff.example.com", ctx());
    expect(r).toMatchObject({ age_days: 4, source: "mock_registry", allowlisted: false });
    expect(r.brand_clone_of).toBeTruthy();
  });
  it("allowlisted hosts and unknown hosts", async () => {
    expect((await domainIntel("www.amazon.com", ctx())).allowlisted).toBe(true);
    const u = await domainIntel("random-unknown.top", ctx());
    expect(u).toMatchObject({ age_days: null, source: "unknown", tld_risk: true });
  });
  it("RDAP: parses registration date; times out / errors → null", async () => {
    const ok = (async () => new Response(JSON.stringify({ events: [{ eventAction: "registration", eventDate: new Date(Date.now() - 10 * 86_400_000).toISOString() }] }))) as unknown as typeof fetch;
    expect((await rdapAgeDays("x.com", ok))!.ageDays).toBe(10);
    const bad = (async () => { throw new Error("net"); }) as unknown as typeof fetch;
    expect(await rdapAgeDays("x.com", bad)).toBeNull();
    const notFound = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect(await rdapAgeDays("x.com", notFound)).toBeNull();
    const slow = ((_u: string, init: RequestInit) => new Promise((_r, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))) as unknown as typeof fetch;
    const t0 = Date.now();
    expect(await rdapAgeDays("x.com", slow)).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3600);
  }, 10000);
});

describe("page_signals", () => {
  const scamHtml = `<html><head><title>Retro Runner Sale</title></head><body><h1>85% OFF</h1><p>Only 3 left!</p><div data-countdown="09:59"></div>
    <p>We accept gift card or crypto only.</p><input autocomplete="cc-number" name="card"></body></html>`;
  const legitHtml = `<html><head><title>Bayou Bakery</title></head><body><a href="/contact">Contact us</a> <p>Returns accepted within 30 days. Refund policy below.</p><input autocomplete="cc-number"></body></html>`;
  it("extracts scam signals", () => {
    const s = extractSignalsFromHtml(scamHtml, "fastkicks-shop");
    expect(s).toMatchObject({ has_card_field: true, gift_card_or_crypto_only: true, countdown_timer: true, scarcity_banner: true, no_contact_page: true, no_refund_policy: true, discount_pct: 85 });
  });
  it("extracts legit signals", () => {
    const s = extractSignalsFromHtml(legitHtml, "bayou-bakery");
    expect(s).toMatchObject({ no_contact_page: false, no_refund_policy: false, gift_card_or_crypto_only: false, countdown_timer: false });
  });
  it("only known storefront slugs are ever read (no SSRF / path traversal)", async () => {
    expect(demoSlugFor("fastkicks-shop.bluff.example.com", "bluff.example.com")).toBe("fastkicks-shop");
    expect(demoSlugFor("evil.com", "bluff.example.com")).toBeNull();
    expect(demoSlugFor("169.254.169.254", "bluff.example.com")).toBeNull();
    const r = await pageSignals("evil.com");
    expect(r).toMatchObject({ analyzed: false, source: "none" });
    expect(r.note).toMatch(/limited check/);
  });
  it("extension-provided signals pass through", async () => {
    expect((await pageSignals("x.com", { countdown_timer: true })).source).toBe("extension");
  });
});

describe("taxonomy_match", () => {
  it("keyword fallback finds the delivery-fee category", async () => {
    const r = await taxonomyMatch("Your package is held. Pay $1.99 redelivery fee within 12 hrs", ctx());
    expect(r[0].category).toBe("delivery_fee");
    expect(r[0].method).toBe("keyword");
    expect(r.length).toBeLessThanOrEqual(3);
  });
  it("benign text maps to the legit category; empty text does not crash", async () => {
    expect((await taxonomyMatch("Your order is ready for pickup", ctx()))[0].category).toBe("legit_transactional");
    expect((await taxonomyMatch("", ctx())).length).toBeGreaterThanOrEqual(0);
  });
  it("keyword fallback returns scam/legit kind and the top match's next steps", async () => {
    const r = await taxonomyMatch("Unpaid toll of $4.15. Pay now to avoid a $50 penalty: tollpay-notice.top", ctx());
    expect(r[0]).toMatchObject({ category: "toll_scam", kind: "scam", method: "keyword" });
    expect(r[0].next_steps?.join(" ")).toMatch(/7726/);
    const otp = await taxonomyMatch("Your sign-in code is 730214. Never share it with anyone.", ctx());
    expect(otp[0]).toMatchObject({ category: "legit_otp", kind: "legit" });
  });
  it("cosine math", () => {
    expect(cosine([1, 0], [1, 0])).toBe(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([], [1])).toBe(0);
    expect(keywordMatch("x", [])).toEqual([]);
  });
});

describe("exposure_lookup + txn_search", () => {
  it("finds the linked exposure for a descriptor and honestly returns none otherwise", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','fastkicks-shop.example','fastkicks-shop',18,'likely_scam','continue',$2,'{card_number}')", [MAYA_ID, new Date(NOW.getTime() - 3 * 86_400_000)]);
    const hit = await exposureLookup({ descriptor: "FKSHP*LLC" }, ctx());
    expect(hit[0]).toMatchObject({ host: "fastkicks-shop.example", kind: "flagged" });
    expect(hit[0].match_score).toBeGreaterThan(0.55);
    expect(await exposureLookup({ descriptor: "NOTHING LIKE IT" }, ctx())).toEqual([]);
    expect((await exposureLookup({ host: "fastkicks-shop.bluff.example.com" }, ctx()))[0].reasons).toEqual(["same site"]);
    expect(await exposureLookup({}, ctx())).toEqual([]);
  });
  it("txn_search returns stats and a series for a known merchant, zeros for unknown", async () => {
    const s = await txnSearch({ descriptor_norm: normalizeDescriptor("STREAMBOX.COM") }, ctx());
    expect(s.count).toBe(3);
    expect(s.avg_cents).toBe(1599);
    expect(s.series.length).toBeGreaterThan(0);
    const none = await txnSearch({ descriptor_norm: "fkshp" }, ctx());
    expect(none).toMatchObject({ count: 0, avg_cents: 0, last_seen: null });
  });
});

describe("submit_verdict", () => {
  const args = { score: 18, verdict: "likely_scam", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: ["domain_age_lt_30", "gift_card_only", "brand_clone", "countdown_timer"], next_steps: ["Leave", "Report"] };
  it("accepts valid args, computes confidence server-side, overrides self-reported confidence", () => {
    const r = submitVerdict({ ...args, confidence: 0.01 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.verdict.confidence).toBe(0.95); expect(r.verdict.mode).toBe("live"); }
  });
  it("derives the label from the score and forces unsure when confidence < 0.5", () => {
    const r = submitVerdict({ ...args, evidence_keys: [], verdict: "likely_scam", score: 10 });
    expect(r.ok && r.verdict.verdict).toBe("unsure");
    expect(r.ok && r.verdict.score).toBe(40);
  });
  it("returns readable validation errors", () => {
    const r = submitVerdict({ ...args, evidence: ["only one"], score: 120 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/score|evidence/);
  });
});

describe("registry", () => {
  it("caps tool output at 1 KB", () => {
    expect(JSON.stringify(capJson(Array.from({ length: 200 }, (_, i) => ({ i, text: "x".repeat(40) })))).length).toBeLessThanOrEqual(1024);
    expect(JSON.stringify(capJson({ big: "y".repeat(5000) })).length).toBeLessThanOrEqual(1024);
  });
  it("unknown tools and thrown errors become error results", async () => {
    expect(await runTool("nope", {}, ctx())).toEqual({ error: "unknown tool: nope" });
    const bad = { ...ctx(), db: { query: async () => { throw new Error("db down"); } } as never };
    expect(await runTool("txn_search", { descriptor_norm: "x" }, bad)).toEqual({ error: "db down" });
  });
  it("message runs get their own tool set; page/site/txn sets are unchanged", () => {
    expect(BY_KIND.message).toEqual(["taxonomy_match", "domain_intel", "submit_verdict"]);
    expect(openAiTools("message").map((t) => t.function.name).sort()).toEqual(["domain_intel", "submit_verdict", "taxonomy_match"]);
    for (const k of ["page", "txn"]) expect(openAiTools(k).map((t) => t.function.name)).toEqual(expect.arrayContaining(["notify", "draft_dispute", "page_signals"]));
  });
  it("exposes OpenAI-compatible definitions", () => {
    expect(TOOLS.map((x) => x.name)).toEqual(expect.arrayContaining(["domain_intel", "page_signals", "taxonomy_match", "exposure_lookup", "txn_search", "submit_verdict"]));
    for (const d of openAiTools()) expect(d.function.parameters).toMatchObject({ type: "object" });
  });
});
