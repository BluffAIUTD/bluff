import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb } from "../../tests/testdb";
import { closePool } from "../db";
import { MAYA_ID } from "../config";
import { liveRun, MAX_ITERATIONS, reconcileLink } from "./live";
import { VerdictSchema, type RunStreamEvent } from "../schemas";
import type { RunInput } from "./types";
import { normalizeDescriptor } from "../linker/normalize";
import { scanWebsite } from "../scan/site";
import { diskFetcher } from "../../tests/diskFetcher";

type Reply = { status?: number; body?: unknown; hang?: boolean };
let queue: Reply[] = [];
let seen: { messages: { role: string; content: string }[]; tools?: { function: { name: string } }[] }[] = [];
let server: http.Server;
let t: Awaited<ReturnType<typeof createTestDb>>;

const call = (name: string, args: unknown, id = `c${Math.random().toString(36).slice(2, 6)}`) => ({ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } });
const msg = (tool_calls: unknown[], content: string | null = null) => ({ body: { choices: [{ message: { content, tool_calls } }] } });
const goodVerdict = { score: 18, verdict: "likely_scam", category: "fake_store", evidence: ["Site is 4 days old", "Only takes gift cards", "Copies a brand"], evidence_keys: ["domain_age_lt_30", "gift_card_only", "brand_clone"], next_steps: ["Leave this site", "Shop somewhere you know"] };

beforeAll(async () => {
  t = await createTestDb("bluff_live_test", { seed: true });
  process.env.DATABASE_URL = t.url;
  server = http.createServer((req, res) => {
    let b = "";
    req.on("data", (d) => (b += d));
    req.on("end", () => {
      seen.push(JSON.parse(b));
      const r = queue.shift() ?? { status: 500, body: { error: "queue empty" } };
      if (r.hang) return; // never answers
      res.writeHead(r.status ?? 200, { "content-type": "application/json" });
      res.end(typeof r.body === "string" ? r.body : JSON.stringify(r.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.NVIDIA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
  process.env.NVIDIA_API_KEY = "test";
  process.env.NEMOTRON_MODEL = "test-model";
});
afterAll(async () => { server.closeAllConnections?.(); server.close(); await closePool(); await t.drop(); delete process.env.AGENT_DEADLINE_MS; delete process.env.PAGE_CRAWL; });
// The loop tests below cover page checks without a crawl (PAGE_CRAWL=0); "website review" further down turns it on.
beforeEach(() => { queue = []; seen = []; delete process.env.AGENT_DEADLINE_MS; process.env.PAGE_CRAWL = "0"; });

const page: RunInput = { kind: "page", userId: MAYA_ID, url: "https://fastkicks-shop.bluff.example.com", host: "fastkicks-shop", fieldTypes: ["card_number"], signals: {}, source: "check" };
async function run(input: RunInput = page, fail?: "timeout", extra: { fresh?: boolean } = {}) {
  const ev: RunStreamEvent[] = [];
  const r = await liveRun(input, (e) => ev.push(e), { fail, fetcher: diskFetcher, ...extra });
  return { r, ev, steps: ev.filter((e) => e.type === "step") as Extract<RunStreamEvent, { type: "step" }>[] };
}

describe("live agent loop", () => {
  it("happy path: tools then submit_verdict → live verdict, steps streamed, confidence computed server-side", async () => {
    queue = [msg([call("domain_intel", { host: "fastkicks-shop" })]), msg([call("page_signals", { host: "fastkicks-shop" })]), msg([call("submit_verdict", { ...goodVerdict, confidence: 0.1 })])];
    const { r, steps } = await run();
    expect(r.mode).toBe("live");
    expect(VerdictSchema.safeParse(r.verdict).success).toBe(true);
    expect(r.verdict.confidence).toBeGreaterThan(0.5);
    const tools = steps.map((s) => s.data.tool);
    expect(tools).toEqual([null, "domain_intel", "page_signals", "submit_verdict"]);
    expect(steps[1].data.outputSummary).toContain("4 days old");
    expect(steps.at(-1)!.data.kind).toBe("final");
    // tool results were fed back to the model
    expect(seen[1].messages.some((m) => m.role === "tool" && m.content.includes("age_days"))).toBe(true);
  });

  it("invalid verdict → one repair turn → success", async () => {
    queue = [msg([call("submit_verdict", { ...goodVerdict, evidence: ["only one"] })]), msg([call("submit_verdict", goodVerdict)])];
    const { r } = await run();
    expect(r.mode).toBe("live");
    expect(seen[1].messages.at(-1)!.content).toMatch(/failed validation/);
  });

  it("repair fails → malformed error + basic fallback", async () => {
    const bad = { ...goodVerdict, evidence: ["x"] };
    queue = [msg([call("submit_verdict", bad)]), msg([call("submit_verdict", bad)])];
    const { r, ev } = await run();
    expect(r.mode).toBe("basic");
    const err = ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>;
    expect(err.data.code).toBe("malformed");
    expect(err.data.fallbackVerdict?.mode).toBe("basic");
  });

  it("non-JSON tool arguments and unknown tools are reported to the model, the run continues", async () => {
    queue = [msg([call("domain_intel", "{not json"), call("nope", {})]), msg([call("submit_verdict", goodVerdict)])];
    const { r, steps } = await run();
    expect(r.mode).toBe("live");
    expect(steps.map((s) => s.data.outputSummary).join("|")).toMatch(/not valid JSON.*unknown tool: nope/);
  });

  it("model never calls a tool (even after a nudge) → fallback", async () => {
    queue = [{ body: { choices: [{ message: { content: "It looks fine." } }] } }, { body: { choices: [{ message: { content: "Still fine." } }] } }];
    const { r } = await run();
    expect(r.mode).toBe("basic");
  });

  it("iteration cap: endless tool calls stop after 6 requests", async () => {
    queue = Array.from({ length: 10 }, () => msg([call("domain_intel", { host: "x.com" })]));
    const { r } = await run();
    expect(r.mode).toBe("basic");
    expect(seen.length).toBe(MAX_ITERATIONS);
  });

  it("429 → rate_limited fallback; 500 → upstream_down fallback; garbage body → malformed", async () => {
    queue = [{ status: 429, body: {} }];
    let o = await run();
    expect((o.ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>).data.code).toBe("rate_limited");
    queue = [{ status: 500, body: {} }];
    o = await run();
    expect((o.ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>).data.code).toBe("upstream_down");
    queue = [{ body: "<html>" }];
    o = await run();
    expect((o.ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>).data.code).toBe("malformed");
  });

  it("a 429 is retried with backoff and then succeeds (no fallback)", async () => {
    process.env.NVIDIA_RETRIES = "3"; process.env.NVIDIA_RETRY_BASE_MS = "1";
    try {
      queue = [{ status: 429, body: {} }, { status: 429, body: {} }, msg([call("submit_verdict", goodVerdict)])];
      const { r } = await run();
      expect(r.mode).toBe("live");
      expect(seen.length).toBe(3);
    } finally { process.env.NVIDIA_RETRIES = "0"; delete process.env.NVIDIA_RETRY_BASE_MS; }
  });

  it("deadline: a hung model → timeout fallback", async () => {
    process.env.AGENT_DEADLINE_MS = "300";
    queue = [{ hang: true }];
    const o = await run();
    expect((o.ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>).data.code).toBe("timeout");
    expect(o.r.mode).toBe("basic");
  });

  it("txn mode: precomputed candidates go to the model; the link is reconciled against real candidates only", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','fastkicks-shop.example','fastkicks-shop',18,'likely_scam','continue',now() - interval '3 days','{card_number}')", [MAYA_ID]);
    const txnId = (await t.pool.query("INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents) VALUES (now(),$1,'FKSHP*LLC',$2,4999) RETURNING id", [MAYA_ID, normalizeDescriptor("FKSHP*LLC")])).rows[0].id as string;
    const expId = (await t.pool.query("SELECT id FROM exposures WHERE label='fastkicks-shop' AND user_id=$1", [MAYA_ID])).rows[0].id;
    queue = [msg([call("txn_search", { descriptor_norm: "fkshp" })]), msg([call("exposure_lookup", { descriptor: "FKSHP*LLC" })]),
      msg([call("submit_verdict", { ...goodVerdict, evidence_keys: ["domain_age_lt_30", "brand_clone", "gift_card_only"], linked: { exposure_id: "11111111-1111-4111-8111-111111111111" } })])];
    const { r, steps } = await run({ kind: "txn", userId: MAYA_ID, txnId });
    expect(JSON.parse(seen[0].messages[1].content).candidates[0].exposure_id).toBe(expId);
    expect(steps.map((s) => s.data.tool)).toEqual([null, "txn_search", "exposure_lookup", "submit_verdict"]);
    // invented exposure id is replaced by the real top candidate (≥ .75 → "possible"), never trusted
    expect(r.verdict.linked.exposure_id).toBe(expId);
    expect(r.verdict.linked.kind).toBe("possible");
    // when the agent names the real candidate, the link is kept as flagged with SQL reasons
    queue = [msg([call("submit_verdict", { ...goodVerdict, linked: { exposure_id: expId } })])];
    const ok = await run({ kind: "txn", userId: MAYA_ID, txnId });
    expect(ok.r.verdict.linked).toMatchObject({ exposure_id: expId, txn_id: txnId, kind: "flagged" });
    expect(ok.r.verdict.linked.match_reasons!.join(" ")).toContain("after exposure");
  });

  it("reconcileLink: no candidates → no exposure link; non-txn runs never link", () => {
    const base = VerdictSchema.parse({ ...goodVerdict, confidence: 0.9, confidence_reason: "x", mode: "live" });
    expect(reconcileLink(base, [], "t1").linked).toEqual({ txn_id: "t1" });
    expect(reconcileLink({ ...base, linked: { exposure_id: "e" } }, [], undefined).linked).toEqual({});
  });
});

/** Every substring of `text` at least `n` characters long that appears in `stored` (the privacy check). */
const leaked = (text: string, stored: string, n = 12) => {
  const hits: string[] = [];
  for (let i = 0; i + n <= text.length; i++) if (stored.includes(text.slice(i, i + n))) hits.push(text.slice(i, i + n));
  return hits;
};

describe("message mode", () => {
  const text = "Unpaid toll balance of $6.40 on your account. Pay within 24 hours to avoid a $50 penalty: tollpay-notice.top/pay?id=8812";
  const sms: RunInput = { kind: "message", userId: MAYA_ID, text, source: "check" };
  const tollVerdict = { score: 12, verdict: "likely_scam", category: "toll_scam", evidence: ["Threatens a penalty", "Pressure to pay within hours", "Link uses a scam-prone domain"], evidence_keys: ["threat_language", "urgency_language", "lookalike_domain"], next_steps: ["Block the sender", "Delete the text"] };

  it("offers only taxonomy_match, domain_intel and submit_verdict; other tools are refused, not run", async () => {
    queue = [msg([call("taxonomy_match", { text }), call("domain_intel", { host: "tollpay-notice.top" }), call("notify", { title: "x", body: text })]), msg([call("submit_verdict", tollVerdict)])];
    const { r, steps } = await run(sms);
    expect(seen[0].tools!.map((t) => t.function.name).sort()).toEqual(["domain_intel", "submit_verdict", "taxonomy_match"]);
    expect(seen[0].messages.find((m) => m.role === "system")!.content).toMatch(/Mode: message/);
    expect(steps.find((s) => s.data.tool === "notify")!.data.outputSummary).toMatch(/not available in this mode/);
    expect(r.mode).toBe("live");
    expect(r.verdict.category).toBe("toll_scam");
    // the taxonomy's vetted steps come first, the model's own after
    expect(r.verdict.next_steps[0]).toMatch(/official toll site/);
    expect(r.verdict.next_steps.join(" ")).toMatch(/7726/);
  });

  it("privacy: the stored step summaries contain no fragment of the message (>= 12 chars)", async () => {
    queue = [msg([call("taxonomy_match", { text }), call("domain_intel", { host: "https://tollpay-notice.top/pay?id=8812" })]), msg([call("submit_verdict", tollVerdict)])];
    const { steps } = await run(sms);
    const stored = steps.map((s) => `${s.data.inputSummary}\n${s.data.outputSummary}`).join("\n");
    // The link's host is kept on purpose (it is what domain_intel looked up); nothing else from the text is.
    expect(stored).toContain("tollpay-notice.top");
    expect(leaked(text, stored.replaceAll("tollpay-notice.top", "<host>"))).toEqual([]);
    expect(stored).not.toContain("8812");
  });

  it("confidence counts the server's own rule signals, not the model's self-report", async () => {
    queue = [msg([call("submit_verdict", { ...tollVerdict, evidence_keys: [], confidence: 0.99 })])];
    const { r } = await run(sms);
    expect(r.verdict.confidence).toBeGreaterThan(0.8);
    expect(r.verdict.confidence).toBeLessThan(0.99);
  });
});

describe("website review: the scraped site goes to Nemotron", () => {
  beforeEach(() => { delete process.env.PAGE_CRAWL; });
  const siteVerdict = { ...goodVerdict, summary: "VoltDeals refunds only in store credit and steers buyers away from cards.", findings: [{ title: "Store credit only", detail: "Refund page", severity: "high", page: "/refund-policy.html" }], agrees_with_basic: true };
  const volt: RunInput = { kind: "page", userId: MAYA_ID, url: "https://voltdeals-outlet.example/checkout", host: "voltdeals-outlet", fieldTypes: ["card_number", "cvv"], signals: { countdown_timer: false }, source: "check" };
  const firstUser = (i = 0) => JSON.parse(seen[i].messages.find((m) => m.role === "user")!.content);

  it("page check: crawls the site, sends every page's text with registry facts and the basic check, returns Nemotron's analysis", async () => {
    queue = [msg([call("read_page", { types: ["refund"] })]), msg([call("submit_verdict", siteVerdict)])];
    const { r, steps } = await run(volt, undefined, { fresh: true });
    expect(steps.map((s) => s.data.tool)).toEqual([null, "crawl_site", "read_page", "submit_verdict"]);
    expect(steps[1].data.outputSummary).toMatch(/\d+ pages read · basic check \d+ · sent to Nemotron/);
    // the first request already carries the scraped website
    const subject = firstUser();
    expect(subject.subject).toBe("page");
    expect(subject.website_data.pages.length).toBeGreaterThanOrEqual(8);
    expect(subject.website_data.pages.map((p: { text: string }) => p.text).join(" ").toLowerCase()).toContain("store credit");
    expect(subject.website_data.registry.domain_age_days).toBe(21);
    expect(subject.website_data.basic_check.findings.length).toBeGreaterThan(0);
    expect(seen[0].messages[0].content).toMatch(/page check with website review/);
    expect(seen[0].tools!.map((x) => x.function.name).sort()).toEqual(["fetch_page", "read_page", "submit_verdict"]);
    // read_page reads the same crawl
    expect(seen[1].messages.some((m) => m.role === "tool" && m.content.toLowerCase().includes("store credit"))).toBe(true);
    expect(r.mode).toBe("live");
    expect(r.verdict.analysis?.summary).toContain("store credit");
    expect(r.verdict.analysis?.findings[0].page).toBe("/refund-policy.html");
  });

  it("page check: a recent crawl of the same site is reused, and still sent", async () => {
    queue = [msg([call("submit_verdict", siteVerdict)])];
    const { steps } = await run(volt);
    expect(steps[1].data.outputSummary).toMatch(/read earlier/);
    expect(firstUser().website_data.pages.length).toBeGreaterThanOrEqual(8);
  });

  it("page check: when Nemotron is down the verdict is the rules over the same crawl, with before-you-pay next steps", async () => {
    queue = [{ status: 500, body: {} }];
    const { r, ev } = await run(volt);
    const err = ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>;
    expect(err.data.code).toBe("upstream_down");
    expect(r.mode).toBe("basic");
    expect(r.verdict.verdict).toBe("likely_scam");
    expect(r.verdict.evidence.join(" ")).not.toMatch(/Limited check/);
    expect(r.verdict.next_steps[0]).toMatch(/Don't enter any payment details/);
  });

  it("page check: hosts that aren't websites are not crawled", async () => {
    queue = [msg([call("submit_verdict", goodVerdict)])];
    const { steps } = await run({ ...volt, host: "localhost" });
    expect(steps.map((s) => s.data.tool)).not.toContain("crawl_site");
    expect(firstUser().website_data).toBeUndefined();
  });

  it("bank scan deep review: the crawl's data is in the first request, no overview call needed", async () => {
    const scan = await scanWebsite(t.pool, MAYA_ID, { website: "voltdeals-outlet.localhost:3000", merchant: "VoltDeals Outlet", crawl: { fetcher: diskFetcher } });
    queue = [msg([call("submit_verdict", siteVerdict)])];
    const { r } = await run({ kind: "site", userId: MAYA_ID, txnId: "00000000-0000-4000-8000-0000000000aa", host: scan.host, merchant: "VoltDeals Outlet", descriptor: "VOLTDEALS", scanId: scan.id });
    expect(r.mode).toBe("live");
    const subject = firstUser();
    expect(subject.subject).toBe("merchant_site");
    expect(subject.website_data.pages.length).toBe(scan.crawl.pages.length);
    expect(subject.website_data.pages.find((p: { type: string }) => p.type === "refund").text.toLowerCase()).toContain("store credit");
    expect(seen[0].tools!.map((x) => x.function.name)).not.toContain("site_overview");
  });
});
