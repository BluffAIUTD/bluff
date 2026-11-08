import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";

// Capture what the page route hands to the agent instead of running it.
const startRun = vi.hoisted(() => vi.fn<(...args: unknown[]) => Promise<{ runId: string }>>(async () => ({ runId: "00000000-0000-4000-8000-00000000e710" })));
vi.mock("../lib/agent/runs", async (orig) => ({ ...(await orig<typeof import("../lib/agent/runs")>()), startRun }));

import { createTestDb, sessionCookie } from "../tests/testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as investigatePage } from "../app/api/investigate/page/route";
import { POST as createExp } from "../app/api/exposures/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_ext_routes_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => { startRun.mockClear(); await t.pool.query("DELETE FROM exposures"); });

const post = (url: string, body: unknown) => new Request(`http://x${url}`, { method: "POST", headers: { "content-type": "application/json", ...sessionCookie() }, body: JSON.stringify(body) });
const FULL = "https://shop.example/checkout/step-2?email=maya%40example.com#card";

describe("server keeps only the origin for extension checks", () => {
  it("/api/investigate/page strips path, query and hash when source is the extension", async () => {
    const r = await investigatePage(post("/api/investigate/page", { url: FULL, host: "shop.example", fieldTypes: ["card_number"], source: "extension" }));
    expect(r.status).toBe(200);
    expect(startRun.mock.calls[0][0]).toMatchObject({ kind: "page", url: "https://shop.example/", host: "shop.example", source: "extension" });
  });
  it("/check links keep the full link (the user pasted it on purpose)", async () => {
    await investigatePage(post("/api/investigate/page", { url: FULL, source: "check" }));
    expect(startRun.mock.calls[0][0]).toMatchObject({ url: FULL, host: "shop.example", source: "check" });
  });

  it("/api/exposures stores only the origin for the extension, the given url otherwise", async () => {
    const payload = { score: 80, verdict: "looks_ok", confidence: 0.8, confidence_reason: "r", category: "legit_store", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["x"], linked: {}, mode: "basic" };
    const verdictId = (await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'page','shop.example',$2,'basic') RETURNING id", [MAYA_ID, JSON.stringify(payload)])).rows[0].id;
    const ext = await createExp(post("/api/exposures", { verdictId, url: FULL, host: "shop.example", fieldTypes: ["card_number"], action: "watch", source: "extension" }));
    expect(ext.status).toBe(201);
    expect((await ext.json()).exposure.host).toBe("shop.example");
    const other = await createExp(post("/api/exposures", { verdictId, url: "https://shop.example/cart", host: "shop.example", fieldTypes: [], action: "continue" }));
    expect(other.status).toBe(201);
    const urls = (await t.pool.query("SELECT url, user_action FROM exposures ORDER BY created_at")).rows;
    expect(urls).toEqual([{ url: "https://shop.example/", user_action: "watch" }, { url: "https://shop.example/cart", user_action: "continue" }]);
  });
  it("/api/exposures rejects a non-web url from the extension", async () => {
    const r = await createExp(post("/api/exposures", { verdictId: "x", url: "ftp://shop.example/x", host: "h", action: "continue", source: "extension" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.message).toBe("Only web links can be checked");
  });
});
