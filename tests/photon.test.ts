import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as webhook } from "../app/api/webhooks/photon/route";
import { POST as demoInbound } from "../app/api/demo/inbound/route";
import { handleInbound, verdictReply } from "../lib/photon/inbound";
import { parseCommand } from "../lib/photon/commands";
import { parseInbound, signBody, verifySignature } from "../lib/photon/webhook";
import { liveSender } from "../lib/photon/live";
import { postScriptedCharge, findScript } from "../lib/demo";
import { sendChargeAlert } from "../lib/agent/hooks";
import { notifyTool } from "../lib/agent/tools/notifyTool";
import { VerdictSchema } from "../lib/schemas";

let t: Awaited<ReturnType<typeof createTestDb>>;
const PHONE = "+15125550100";
beforeAll(async () => { t = await createTestDb("bluff_photon_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.PHOTON_MODE = "mock"; process.env.AGENT_MODE = "mock"; delete process.env.PHOTON_WEBHOOK_SECRET; delete process.env.PHOTON_MOCK_FAIL;
  for (const tbl of ["messages", "disputes", "exposures", "allowlist"]) await t.pool.query(tbl === "allowlist" ? "DELETE FROM allowlist WHERE user_id IS NOT NULL" : `DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM transactions WHERE script_id IS NOT NULL");
  await t.pool.query("UPDATE users SET phone=$1, alerts_paused=false WHERE id=$2", [PHONE, MAYA_ID]);
  // reset the SMS rate limiter bucket by using unique providers/phones per test where needed
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
    expect(await waitFor(async () => (await outbox()).some((m) => m.status === "sent"))).toBe(true);
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
    process.env.PHOTON_HOLDING_MS = "50"; process.env.MOCK_SPEED = "0.5";
    const r = await handleInbound(t.pool, msg("Pay $1.99 redelivery fee within 12 hrs parcelo-redeliver.help/pay", "+15125557777"));
    delete process.env.PHOTON_HOLDING_MS; process.env.MOCK_SPEED = "0";
    expect(r.reply).toMatch(/^Likely scam/);
    expect(await waitFor(async () => (await t.pool.query("SELECT 1 FROM messages WHERE body='Checking… this one''s taking a moment'")).rowCount === 1)).toBe(true);
  });

  it("SMS flood is rate limited per number", async () => {
    const flooder = "+15125558888";
    let limited = 0;
    for (let i = 0; i < 32; i++) { const r = await handleInbound(t.pool, msg("Is this real? Pay $1.99 fee now parcelo.top", flooder)); if (r.reply?.includes("overloaded")) limited++; }
    expect(limited).toBeGreaterThan(0);
  });
});

describe("reply commands", () => {
  it("WATCH sets watch on the last alerted exposure; SAFE allowlists it; STOP pauses alerts; HELP lists commands", async () => {
    const { exp } = await exposureAndCharge();
    await t.pool.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, meta) VALUES ($1,$2,'out','alert','alert','sent',$3)", [MAYA_ID, PHONE, JSON.stringify({ exposure_id: exp })]);
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

describe("webhook", () => {
  const post = (payload: unknown, headers: Record<string, string> = {}) => webhook(new Request("http://x/api/webhooks/photon", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: typeof payload === "string" ? payload : JSON.stringify(payload) }));

  it("mock mode without a secret accepts payloads, answers 200 fast, processes async", async () => {
    const r = await post({ from: PHONE, text: "hello bayou order ready", id: `w${Date.now()}` });
    expect(r.status).toBe(200);
    expect(await waitFor(async () => (await outbox()).length === 1)).toBe(true);
  });

  it("with a secret: valid HMAC passes (hex or sha256= prefix), bad/missing signature is 403 and nothing is processed", async () => {
    process.env.PHOTON_WEBHOOK_SECRET = "s3cret";
    const body = JSON.stringify({ from: PHONE, text: "help", id: `s${Date.now()}` });
    expect((await post(body)).status).toBe(403);
    expect((await post(body, { "x-photon-signature": "deadbeef" })).status).toBe(403);
    expect((await post(body, { "x-photon-signature": signBody(body, "s3cret") })).status).toBe(200);
    expect(verifySignature(body, `sha256=${signBody(body, "s3cret")}`, "s3cret")).toBe(true);
    expect(verifySignature(body, null, "s3cret")).toBe(false);
  });

  it("rejects non-JSON and unrecognized payloads", async () => {
    expect((await post("not json")).status).toBe(400);
    expect((await post({ hello: "world" })).status).toBe(400);
  });

  it("tolerant payload parsing", () => {
    expect(parseInbound({ sender: "+1", message: { text: "hi", id: "m1" } })).toEqual({ from: "+1", text: "hi", providerId: "m1", hasImage: false });
    expect(parseInbound({ from: "+1", id: "x", attachments: [{ url: "u" }] })?.hasImage).toBe(true);
    expect(parseInbound(null)).toBeNull();
  });
});

describe("outbound live sender + phone preview", () => {
  it("live sender posts to the configured base with bearer auth and returns the provider id", async () => {
    let seen: { auth?: string; body?: string; url?: string } = {};
    const srv = http.createServer((rq, rs) => { let b = ""; rq.on("data", (d) => (b += d)); rq.on("end", () => { seen = { auth: rq.headers.authorization, body: b, url: rq.url }; rs.writeHead(200, { "content-type": "application/json" }); rs.end(JSON.stringify({ id: "ph_123" })); }); });
    await new Promise<void>((r) => srv.listen(0, r));
    process.env.PHOTON_API_BASE = `http://127.0.0.1:${(srv.address() as AddressInfo).port}/v1`; process.env.PHOTON_PROJECT_SECRET = "proj"; process.env.PHOTON_NUMBER = "+15550001111";
    expect(await liveSender.send("+15125550100", "hello")).toEqual({ providerId: "ph_123" });
    expect(seen.auth).toBe("Bearer proj"); expect(seen.url).toBe("/v1/messages"); expect(JSON.parse(seen.body!)).toMatchObject({ to: "+15125550100", text: "hello" });
    delete process.env.PHOTON_API_BASE;
    await expect(liveSender.send("x", "y")).rejects.toThrow(/not configured/);
    srv.close();
  });

  it("demo inbound endpoint lets the phone preview talk to Bluff as the demo user", async () => {
    await t.pool.query("UPDATE users SET phone=NULL WHERE id=$1", [MAYA_ID]);
    const res = await demoInbound(new Request("http://x/api/demo/inbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "HELP" }) }));
    expect((await res.json()).reply).toContain("WATCH");
  });

  it("notify tool only queues the canned charge alert and respects limits", async () => {
    const { exp, txn } = await exposureAndCharge();
    const ctx = { userId: MAYA_ID, db: t.pool };
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: txn, exposure_id: exp }, ctx)).toEqual({ queued: true });
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: txn, exposure_id: exp }, ctx)).toEqual({ queued: false, reason: "duplicate" });
    expect(await notifyTool.run({ kind: "text", txn_id: txn, exposure_id: exp }, ctx)).toMatchObject({ queued: false });
    expect(await notifyTool.run({ kind: "charge_alert", txn_id: "00000000-0000-4000-8000-0000000000aa", exposure_id: exp }, ctx)).toMatchObject({ queued: false });
  });
});
