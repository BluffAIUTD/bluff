import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as demoInbound } from "../app/api/demo/inbound/route";
import { handleInbound, verdictReply } from "../lib/messaging/inbound";
import { parseCommand } from "../lib/messaging/commands";
import { postScriptedCharge, findScript } from "../lib/demo";
import { sendChargeAlert } from "../lib/agent/hooks";
import { notifyTool } from "../lib/agent/tools/notifyTool";
import { VerdictSchema } from "../lib/schemas";

let t: Awaited<ReturnType<typeof createTestDb>>;
const PHONE = "+15125550100";
beforeAll(async () => { t = await createTestDb("bluff_messaging_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.AGENT_MODE = "mock";
  for (const tbl of ["messages", "disputes", "exposures", "allowlist"]) await t.pool.query(tbl === "allowlist" ? "DELETE FROM allowlist WHERE user_id IS NOT NULL" : `DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM transactions WHERE script_id IS NOT NULL");
  await t.pool.query("UPDATE users SET phone=$1, alerts_paused=false WHERE id=$2", [PHONE, MAYA_ID]);
});

let n = 0;
const msg = (text: string, from = PHONE, hasImage = false) => ({ from, text, providerId: `p${++n}_${Date.now()}`, hasImage });
const outbox = async () => (await t.pool.query("SELECT body, kind, status FROM messages WHERE direction='out' ORDER BY created_at, id")).rows;
const waitFor = async (fn: () => Promise<boolean>, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };
async function exposureAndCharge() {
  const exp = (await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,field_types,created_at) VALUES ($1,'u','fastkicks-shop','fastkicks-shop',18,'likely_scam','continue','{card_number}', now() - interval '1 hour') RETURNING id", [MAYA_ID])).rows[0].id as string;
  const posted = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: "fastkicks-shop" })!);
  return { exp, txn: posted.id };
}

describe("commands", () => {
  it("case-insensitive exact words only", () => {
    expect(parseCommand("watch")).toBe("WATCH"); expect(parseCommand("  Dispute!  ")).toBe("DISPUTE");
    expect(parseCommand("stop")).toBe("STOP"); expect(parseCommand("Help")).toBe("HELP"); expect(parseCommand("safe")).toBe("SAFE");
    expect(parseCommand("stop the scam texts please")).toBeNull();
    expect(parseCommand("")).toBeNull();
  });
});

describe("forward-to-check", () => {
  it("scam text → verdict reply in the P3-2 format, inbound body discarded, verdict stored", async () => {
    const r = await handleInbound(t.pool, msg("Parcelo: Your package is held. Pay $1.99 redelivery fee within 12 hrs: parcelo-redeliver.help/pay"));
    expect(r.status).toBe("handled");
    expect(r.reply).toMatch(/^Likely scam \(\d+\/100, \d+% sure\)\. Why: .+\. Do: .+\. \(basic check\)$/);
    expect(await waitFor(async () => (await outbox()).some((m) => m.status === "delivered"))).toBe(true);
    const inbound = (await t.pool.query("SELECT body, verdict_id FROM messages WHERE direction='in'")).rows[0];
    expect(inbound.body).toBe("[discarded]");
    expect(inbound.verdict_id).toBeTruthy();
    expect((await t.pool.query("SELECT count(*) n FROM messages WHERE body LIKE '%redelivery%' AND direction='in'")).rows[0].n).toBe("0");
  });

  it("legit text → Looks OK; duplicate delivery of the same provider id is ignored", async () => {
    const m = msg("Bayou Bakery: your order #2281 is ready for pickup until 6 PM today.");
    const a = await handleInbound(t.pool, m);
    expect(a.reply).toMatch(/^Looks OK/);
    expect((await handleInbound(t.pool, m)).status).toBe("duplicate");
    expect((await t.pool.query("SELECT count(*) n FROM messages WHERE direction='out'")).rows[0].n).toBe("1");
  });

  it("edge cases: empty, image-only, too long, low confidence", async () => {
    expect((await handleInbound(t.pool, msg("   "))).reply).toBe("Send me a text or link to check, or HELP");
    expect((await handleInbound(t.pool, msg("", PHONE, true))).reply).toMatch(/only read text/);
    expect((await handleInbound(t.pool, msg("x".repeat(2001)))).reply).toMatch(/too long.*2,000 character max/);
    const unsure = VerdictSchema.parse({ score: 50, verdict: "unsure", confidence: 0.4, confidence_reason: "x", category: "unclear", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["Wait", "Check"], mode: "basic" });
    expect(verdictReply(unsure)).toBe("I'm not sure about this one. Don't click links in it; contact the company through its official app.");
  });

  it("unregistered number is a guest: verdict only, commands get no account data", async () => {
    const stranger = "+15125559999";
    const r = await handleInbound(t.pool, msg("You won a $500 gift card! Claim within 24 hours. Just confirm your SSN.", stranger));
    expect(r.reply).toMatch(/^Likely scam/);
    expect((await handleInbound(t.pool, msg("DISPUTE", stranger))).reply).toMatch(/Forward one over/);
    expect((await handleInbound(t.pool, msg("help", stranger))).reply).toMatch(/Forward me any text or link/);
    expect((await t.pool.query("SELECT 1 FROM messages WHERE user_id IS NULL AND direction='out'")).rowCount).toBeGreaterThan(0);
  });

  it("a slow check sends the holding message first, then the verdict", async () => {
    process.env.HOLDING_MS = "50"; process.env.MOCK_SPEED = "0.5";
    const r = await handleInbound(t.pool, msg("Pay $1.99 redelivery fee within 12 hrs parcelo-redeliver.help/pay", "+15125557777"));
    delete process.env.HOLDING_MS; process.env.MOCK_SPEED = "0";
    expect(r.reply).toMatch(/^Likely scam/);
    expect(await waitFor(async () => (await t.pool.query("SELECT 1 FROM messages WHERE body='Checking… this one''s taking a moment'")).rowCount === 1)).toBe(true);
  });

  it("message flood is rate limited per sender", async () => {
    const flooder = "+15125558888";
    let limited = 0;
    for (let i = 0; i < 32; i++) { const r = await handleInbound(t.pool, msg("Is this real? Pay $1.99 fee now parcelo.top", flooder)); if (r.reply?.includes("overloaded")) limited++; }
    expect(limited).toBeGreaterThan(0);
  });
});

describe("reply commands", () => {
  it("WATCH sets watch on the last alerted exposure; SAFE allowlists it; STOP pauses alerts; HELP lists commands", async () => {
    const { exp } = await exposureAndCharge();
    await t.pool.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, meta) VALUES ($1,$2,'out','alert','alert','delivered',$3)", [MAYA_ID, PHONE, JSON.stringify({ exposure_id: exp })]);
    expect((await handleInbound(t.pool, msg("watch"))).reply).toMatch(/watch your charges.*fastkicks-shop/);
    expect((await t.pool.query("SELECT watch FROM exposures WHERE id=$1", [exp])).rows[0].watch).toBe(true);
    expect((await handleInbound(t.pool, msg("SAFE"))).reply).toMatch(/Marked fastkicks-shop as safe/);
    expect((await t.pool.query("SELECT count(*) n FROM allowlist WHERE user_id=$1", [MAYA_ID])).rows[0].n).not.toBe("0");
    expect((await handleInbound(t.pool, msg("STOP"))).reply).toMatch(/Alerts paused/);
    expect((await t.pool.query("SELECT alerts_paused FROM users WHERE id=$1", [MAYA_ID])).rows[0].alerts_paused).toBe(true);
    expect((await handleInbound(t.pool, msg("HELP"))).reply).toContain("WATCH");
  });

  it("WATCH/SAFE with no recent alert say so", async () => {
    expect((await handleInbound(t.pool, msg("WATCH"))).reply).toMatch(/don't have a recent alert/);
  });

  it("DISPUTE drafts the packet (never files) and replies with a link; none without a linked charge", async () => {
    expect((await handleInbound(t.pool, msg("DISPUTE"))).reply).toMatch(/don't see a linked charge/);
    const { exp, txn } = await exposureAndCharge();
    await sendChargeAlert(t.pool, MAYA_ID, txn, exp);
    const r = await handleInbound(t.pool, msg("dispute"));
    expect(r.reply).toBe(`Your dispute packet is ready to review: http://localhost:3000/charges/${txn}`);
    expect((await t.pool.query("SELECT status FROM disputes WHERE txn_id=$1", [txn])).rows[0].status).toBe("draft");
  });

  it("STOP pauses alerts but replies still go out", async () => {
    await handleInbound(t.pool, msg("STOP"));
    const out = await outbox();
    expect(out.some((m) => m.kind === "reply" && /paused/.test(m.body))).toBe(true);
  });
});

describe("phone preview + notify tool", () => {
  it("demo inbound endpoint lets the phone preview talk to Bluff as the demo user", async () => {
    await t.pool.query("UPDATE users SET phone=NULL WHERE id=$1", [MAYA_ID]);
    const res = await demoInbound(new Request("http://x/api/demo/inbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "HELP" }) }));
    expect((await res.json()).reply).toContain("WATCH");
  });

  it("notify tool only sends the canned charge alert and respects limits", async () => {
    const { exp, txn } = await exposureAndCharge();
    const ctx = { userId: MAYA_ID, db: t.pool };
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: txn, exposure_id: exp }, ctx)).toEqual({ delivered: true });
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: txn, exposure_id: exp }, ctx)).toEqual({ delivered: false, reason: "duplicate" });
    expect(await notifyTool.run({ kind: "text", txn_id: txn, exposure_id: exp }, ctx)).toMatchObject({ delivered: false });
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: "00000000-0000-4000-8000-0000000000aa", exposure_id: exp }, ctx)).toMatchObject({ delivered: false });
  });
});
