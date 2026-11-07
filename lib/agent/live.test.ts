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

type Reply = { status?: number; body?: unknown; hang?: boolean };
let queue: Reply[] = [];
let seen: { messages: { role: string; content: string }[] }[] = [];
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
afterAll(async () => { server.closeAllConnections?.(); server.close(); await closePool(); await t.drop(); delete process.env.AGENT_DEADLINE_MS; });
beforeEach(() => { queue = []; seen = []; delete process.env.AGENT_DEADLINE_MS; process.env.LLM_RETRY_BASE_MS = "1"; });

const page: RunInput = { kind: "page", userId: MAYA_ID, url: "https://fastkicks-shop.bluff.example.com", host: "fastkicks-shop", fieldTypes: ["card_number"], signals: {}, source: "check" };
async function run(input: RunInput = page, fail?: "timeout") {
  const ev: RunStreamEvent[] = [];
  const r = await liveRun(input, (e) => ev.push(e), { fail });
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
    queue = Array.from({ length: 4 }, () => ({ status: 429, body: {} })); // initial try + 3 retries all limited
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
    queue = [{ status: 429, body: {} }, { status: 429, body: {} }, msg([call("submit_verdict", goodVerdict)])];
    const { r } = await run();
    expect(r.mode).toBe("live");
    expect(seen.length).toBe(3);
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

describe("model call throttling", () => {
  it("never runs more than LLM_MAX_CONCURRENCY calls at once", async () => {
    process.env.LLM_MAX_CONCURRENCY = "2";
    let active = 0, peak = 0;
    const slow = (async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 40)); active--; return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] })); }) as unknown as typeof fetch;
    const { chat } = await import("./llm");
    await Promise.all(Array.from({ length: 6 }, () => chat({ model: "m", messages: [{ role: "user", content: "x" }], fetchImpl: slow })));
    expect(peak).toBeLessThanOrEqual(2);
    delete process.env.LLM_MAX_CONCURRENCY;
  });
});
