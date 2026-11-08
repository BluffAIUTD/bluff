import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, sessionCookie } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { ensureAccount, resetAccount } from "../lib/accounts";
import { findReusablePageVerdict } from "../lib/agent/cache";
import { runToCompletion } from "../lib/agent/runs";
import { reuseSiteScan, noWebsiteCrawl } from "../lib/scan/site";
import { saveSiteScan } from "../lib/scan/store";
import { basicCheck } from "../lib/scan/basic";
import type { SiteIntel } from "../lib/scan/intel";
import { GET as listTxns } from "../app/api/transactions/route";
import { GET as listExposures } from "../app/api/exposures/route";
import { DELETE as deleteMe } from "../app/api/me/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb("bluff_accounts_test", { seed: true });
  process.env.DATABASE_URL = t.url;
});
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { process.env.MOCK_SPEED = "0"; process.env.AGENT_MODE = "mock"; });

const count = async (sql: string, args: unknown[]) => Number((await t.pool.query(sql, args)).rows[0].n);
const get = (url: string, userId?: string) => new Request(`http://x${url}`, { headers: userId ? sessionCookie(userId) : {} });

describe("private account per browser session", () => {
  it("a new session gets its own account with the demo history; it never sees another account's data", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action) VALUES ($1,'https://maya-only.test','maya-only.test','maya-only',20,'likely_scam','continue')", [MAYA_ID]);
    const me = randomUUID();
    const txns = (await (await listTxns(get("/api/transactions?limit=500", me))).json()).transactions as { id: string }[];
    expect(txns).toHaveLength(60);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [me])).toBe(60);
    const mayaIds = new Set((await t.pool.query("SELECT id FROM transactions WHERE user_id=$1", [MAYA_ID])).rows.map((r) => r.id));
    expect(txns.some((x) => mayaIds.has(x.id))).toBe(false);
    const exps = (await (await listExposures(get("/api/exposures", me))).json()).exposures as { host: string }[];
    expect(exps.map((e) => e.host)).not.toContain("maya-only.test");
  });

  it("a request with no cookie is issued one and gets a fresh account (not Maya)", async () => {
    const res = await listTxns(get("/api/transactions"));
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^bluff_uid=/);
    const sid = decodeURIComponent(cookie.split(";")[0].split("=")[1]).split(".")[0];
    expect(sid).not.toBe(MAYA_ID);
    expect(await count("SELECT count(*) n FROM users WHERE id=$1", [sid])).toBe(1);
  });

  it("concurrent first requests create the account once", async () => {
    const me = randomUUID();
    await Promise.all(Array.from({ length: 6 }, () => listTxns(get("/api/transactions", me))));
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [me])).toBe(60);
    expect(await ensureAccount(t.pool, me)).toBe(false);
  });

  it("Delete everything resets only the caller's account", async () => {
    const a = randomUUID(), b = randomUUID();
    await ensureAccount(t.pool, a); await ensureAccount(t.pool, b);
    for (const u of [a, b]) await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action) VALUES ($1,'u','h','l',10,'likely_scam','continue')", [u]);
    expect((await deleteMe(new Request("http://x", { method: "DELETE", headers: sessionCookie(a) }))).status).toBe(204);
    expect(await count("SELECT count(*) n FROM exposures WHERE user_id=$1", [a])).toBe(0);
    expect(await count("SELECT count(*) n FROM transactions WHERE user_id=$1", [a])).toBe(60);
    expect(await count("SELECT count(*) n FROM exposures WHERE user_id=$1", [b])).toBe(1);
    expect(await count("SELECT count(*) n FROM exposures WHERE user_id=$1", [MAYA_ID])).toBeGreaterThan(0);
  });

  it("resetAccount keeps Maya's phone number when asked", async () => {
    const u = randomUUID();
    await resetAccount(t.pool, u, { phone: "+15550001111" });
    expect((await t.pool.query("SELECT phone, is_demo FROM users WHERE id=$1", [u])).rows[0]).toEqual({ phone: "+15550001111", is_demo: true });
  });
});

describe("shared site checks", () => {
  const live = (score: number, analysis = true) => JSON.stringify({
    score, verdict: "likely_scam", confidence: 0.9, confidence_reason: "r", evidence: ["e"], evidence_keys: [], next_steps: ["n"], linked: {}, mode: "live",
    ...(analysis ? { analysis: { summary: "Crawled pages show a fake store.", findings: [] } } : {}),
  });

  it("another account's live site review is reused (marked shared); its other live verdicts are not", async () => {
    const a = randomUUID(), b = randomUUID();
    await ensureAccount(t.pool, a); await ensureAccount(t.pool, b);
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'page','shared-review.test',$2,'live')", [a, live(12)]);
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'page','private-check.test',$2,'live')", [a, live(13, false)]);

    const hit = await findReusablePageVerdict(t.pool, b, "shared-review.test");
    expect(hit).toMatchObject({ shared: true, verdict: { score: 12, mode: "cached" } });
    expect((await findReusablePageVerdict(t.pool, a, "shared-review.test"))?.shared).toBe(false);
    expect(await findReusablePageVerdict(t.pool, b, "private-check.test")).toBeNull();
    expect((await findReusablePageVerdict(t.pool, a, "private-check.test"))?.verdict.score).toBe(13);

    const reused = await runToCompletion({ kind: "page", userId: b, url: "https://shared-review.test", host: "shared-review.test", fieldTypes: [], signals: {}, source: "check" });
    expect(reused.mode).toBe("cached");
    expect(reused.verdict.score).toBe(12);
    // The reuse is stored as the second account's own verdict (so it can log an exposure from it).
    expect(await count("SELECT count(*) n FROM verdicts WHERE user_id=$1 AND subject_id='shared-review.test'", [b])).toBe(1);
    // Re-scan (?fresh=1) skips the shared result.
    const rescan = await runToCompletion({ kind: "page", userId: b, url: "https://shared-review.test", host: "shared-review.test", fieldTypes: [], signals: {}, source: "check" }, { fresh: true });
    expect(rescan.verdict.score).not.toBe(12);
  });

  it("a recent crawl by anyone is reused as the user's own scan, with their allowlist and payment history", async () => {
    const a = randomUUID(), b = randomUUID();
    await ensureAccount(t.pool, a); await ensureAccount(t.pool, b);
    const intel: SiteIntel = {
      domain: "crawled.test", allowlisted: false, registration: { createdAt: null, ageDays: 400, expiresAt: null, registrar: null, source: "rdap" },
      tls: { ok: true, issuer: null, validFrom: null, validTo: null, ageDays: null }, dns: { mx: 1, ns: [] }, wayback: { firstSeen: null, years: 0, source: "none" },
    };
    const crawl = noWebsiteCrawl("test crawl");
    const original = await saveSiteScan(t.pool, a, { host: "crawled.test", merchant: "Crawled", crawl, intel, basic: basicCheck(crawl, intel) });
    await t.pool.query("INSERT INTO allowlist (host, user_id) VALUES ('crawled.test', $1)", [b]);

    expect((await reuseSiteScan(t.pool, a, "crawled.test", 6))?.id).toBe(original.id);
    const copy = (await reuseSiteScan(t.pool, b, "crawled.test", 6, { priorCharges: 3 }))!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.crawl.error).toBe("test crawl");
    expect(copy.intel.allowlisted).toBe(true);
    expect(copy.basic.findings.map((f) => f.id)).toEqual(expect.arrayContaining(["allowlisted", "known_merchant"]));
    expect(original.basic.findings.map((f) => f.id)).not.toContain("known_merchant");
    expect(await count("SELECT count(*) n FROM site_scans WHERE user_id=$1 AND host='crawled.test'", [b])).toBe(1);

    await t.pool.query("UPDATE site_scans SET created_at = now() - interval '7 hours' WHERE host='crawled.test'");
    expect(await reuseSiteScan(t.pool, randomUUID(), "crawled.test", 6)).toBeNull();
  });
});
