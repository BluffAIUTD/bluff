import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { callForCharge, shouldCall, spokenSummary, liveCaller } from "../lib/photon/voice";
import { runToCompletion } from "../lib/agent/runs";
import { postScriptedCharge, findScript } from "../lib/demo";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_voice_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.PHOTON_MODE = "mock"; process.env.AGENT_MODE = "mock"; delete process.env.PHOTON_MOCK_FAIL;
  for (const tbl of ["messages", "exposures", "disputes"]) await t.pool.query(`DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM transactions WHERE script_id IS NOT NULL"); await t.pool.query("UPDATE users SET alerts_paused=false");
});
const waitFor = async (fn: () => Promise<boolean>, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };

describe("voice call", () => {
  it("threshold: ≥ $40 and score < 30 only", () => {
    expect(shouldCall(4000, 29)).toBe(true);
    expect(shouldCall(3999, 10)).toBe(false);
    expect(shouldCall(9999, 30)).toBe(false);
  });
  it("spoken summary is ≤ 25 words and spells out the descriptor", () => {
    const s = spokenSummary({ amountCents: 4999, descriptor: "FKSHP*LLC" });
    expect(s.split(/\s+/).length).toBeLessThanOrEqual(25);
    expect(s).toContain("49 dollar");
    expect(s).toContain("F K S H P L");
  });
  it("calls once per charge, logs it, respects STOP, and a failed call is logged while the text stays the fallback", async () => {
    const { rows: [u] } = await t.pool.query("SELECT 1 FROM users WHERE id=$1", [MAYA_ID]); expect(u).toBeTruthy();
    const args = { userId: MAYA_ID, txnId: "txn-1", exposureId: "e1", amountCents: 4999, descriptor: "FKSHP*LLC" };
    expect(await callForCharge(t.pool, args)).toBe("placed");
    expect(await callForCharge(t.pool, args)).toBe("skipped"); // duplicate
    expect((await t.pool.query("SELECT status, kind FROM messages")).rows).toEqual([{ status: "sent", kind: "call" }]);
    await t.pool.query("DELETE FROM messages");
    process.env.PHOTON_MOCK_FAIL = "1";
    expect(await callForCharge(t.pool, { ...args, txnId: "txn-2" })).toBe("failed");
    expect((await t.pool.query("SELECT status FROM messages")).rows[0].status).toBe("failed");
    await t.pool.query("UPDATE users SET alerts_paused=true");
    expect(await callForCharge(t.pool, { ...args, txnId: "txn-3" })).toBe("skipped");
  });
  it("end to end: a high-risk linked charge ($49.99, score < 30) triggers both the text alert and the call; a low-value or legit one does not", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','fastkicks-shop','fastkicks-shop',18,'likely_scam','continue', now() - interval '1 hour','{card_number}')", [MAYA_ID]);
    const posted = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: "fastkicks-shop" })!);
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: posted.id });
    expect(r.verdict.score).toBeLessThan(30);
    expect(await waitFor(async () => (await t.pool.query("SELECT 1 FROM messages WHERE kind='call' AND status='sent'")).rowCount === 1)).toBe(true);
    expect((await t.pool.query("SELECT 1 FROM messages WHERE kind='alert'")).rowCount).toBe(1);
    await t.pool.query("DELETE FROM messages");
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','deliveryfix-help','deliveryfix-help',22,'likely_scam','continue', now() - interval '1 hour','{card_number}')", [MAYA_ID]);
    const small = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: "deliveryfix-help" })!); // $19.99: text only
    await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: small.id });
    await new Promise((r2) => setTimeout(r2, 150));
    expect((await t.pool.query("SELECT 1 FROM messages WHERE kind='call'")).rowCount).toBe(0);
  });
  it("live caller needs configuration (isolated [verify] adapter)", async () => {
    delete process.env.PHOTON_API_BASE;
    await expect(liveCaller.call("+1", "hi")).rejects.toThrow(/not configured/);
  });
});
