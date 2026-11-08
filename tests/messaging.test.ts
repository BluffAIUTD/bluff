import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb, sessionCookie } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as demoInbound } from "../app/api/demo/inbound/route";
import { GET as listInbox, POST as reportText } from "../app/api/demo/scam-text/route";
import { handleInbound, verdictReply } from "../lib/messaging/inbound";
import { parseCommand } from "../lib/messaging/commands";
import { postScriptedCharge, findScript } from "../lib/demo";
import { sendChargeAlert } from "../lib/agent/hooks";
import { notifyTool } from "../lib/agent/tools/notifyTool";
import { basicVerdictFor } from "../lib/agent/mock";
import { alertNewCharge, cardHold } from "../lib/safesignal";
import { scamTexts } from "../data/scamTexts";
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
    expect(parseCommand("hold")).toBe("HOLD"); expect(parseCommand("UNHOLD!")).toBe("UNHOLD"); expect(parseCommand("start")).toBe("START");
    expect(parseCommand("hold my card")).toBeNull();
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

describe("Safe Signal replies (bank scan → phone)", () => {
  const VOLT = "voltdeals-outlet.localhost:3000";
  async function scanCharge() {
    const txn = (await t.pool.query(
      "INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,source,external_id,merchant_name,website) VALUES (now() - interval '1 day',$1,'VOLTDEALS OUTLET','voltdeals outlet',18900,'nessie',$2,'VoltDeals Outlet',$3) RETURNING id",
      [MAYA_ID, `msgtest_${++n}`, VOLT],
    )).rows[0].id as string;
    const payload = { score: 12, verdict: "likely_scam", confidence: 0.82, confidence_reason: "x", category: "fake_store", evidence: ["Domain registered 21 days ago", "Claims to operate since 2016", "Suite 0 address"], evidence_keys: [], next_steps: ["a", "b"], linked: {}, mode: "live" };
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'site',$2,$3,'live')", [MAYA_ID, VOLT, JSON.stringify(payload)]);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: txn, merchant: { host: VOLT, merchant: "VoltDeals Outlet", descriptor: "VOLTDEALS OUTLET", label: "likely_scam", score: 12, confidence: 0.82, mode: "live", topFinding: "Domain registered 21 days ago", txnIds: [txn], latestTxnId: txn, totalCents: 18900 } });
    return txn;
  }
  beforeEach(async () => {
    await t.pool.query("DELETE FROM transactions WHERE external_id LIKE 'msgtest_%'");
    await t.pool.query("DELETE FROM verdicts WHERE subject_type='site'");
    await t.pool.query("UPDATE users SET card_hold_at=NULL");
  });

  it("HOLD sets the simulated card hold (says so plainly); HOLD again and UNHOLD when not held say where things stand", async () => {
    const on = await handleInbound(t.pool, msg("hold"));
    expect(on.reply).toMatch(/^Safe Signal hold is ON \(simulated\)\. .*Nessie.*no real card lock.*Reply UNHOLD/);
    expect((await cardHold(t.pool, MAYA_ID)).held).toBe(true);
    expect((await handleInbound(t.pool, msg("HOLD"))).reply).toMatch(/already on hold \(simulated\) since .*UNHOLD/);
    expect((await handleInbound(t.pool, msg("UNHOLD"))).reply).toMatch(/hold lifted/);
    expect((await cardHold(t.pool, MAYA_ID)).held).toBe(false);
    expect((await handleInbound(t.pool, msg("unhold"))).reply).toMatch(/isn't on hold/);
    expect((await handleInbound(t.pool, msg("HELP"))).reply).toMatch(/HOLD \/ UNHOLD.*simulated/);
    expect(parseCommand("Unhold.")).toBe("UNHOLD");
  });

  it("DISPUTE after a bank-scan alert drafts a dispute from the site check (no exposure needed)", async () => {
    const txn = await scanCharge();
    const r = await handleInbound(t.pool, msg("DISPUTE"));
    expect(r.reply).toBe(`Your dispute packet is ready to review: http://localhost:3000/charges/${txn}`);
    const d = (await t.pool.query("SELECT exposure_id, status, timeline, letter FROM disputes WHERE txn_id=$1", [txn])).rows[0];
    expect(d.status).toBe("draft");
    expect(d.exposure_id).toBeNull();
    expect(d.timeline.map((x: { kind: string }) => x.kind)).toEqual(expect.arrayContaining(["site_check", "alert", "charge"]));
    expect(d.letter).toContain("rated it 12/100 (likely scam)");
  });

  it("SAFE after a bank-scan alert allowlists that website for this user only", async () => {
    await scanCharge();
    const r = await handleInbound(t.pool, msg("safe"));
    expect(r.reply).toBe(`Marked ${VOLT} as safe. I won't flag it or alert you about it again.`);
    expect((await t.pool.query("SELECT user_id FROM allowlist WHERE host=$1", [VOLT])).rows).toEqual([{ user_id: MAYA_ID }]);
  });

  it("Report to Bluff: verdict reply, the scam link's host becomes a received_link exposure, no body or number stored", async () => {
    await t.pool.query("UPDATE users SET phone=NULL WHERE id=$1", [MAYA_ID]);
    const res = await reportText(new Request("http://x/api/demo/scam-text", { method: "POST", headers: { "content-type": "application/json", ...sessionCookie() }, body: JSON.stringify({ id: "deliveryfix" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toMatch(/^Likely scam \(\d+\/100, \d+% sure\)\. .*\(basic check\)$/);
    const e = (await t.pool.query("SELECT * FROM exposures WHERE user_id=$1", [MAYA_ID])).rows;
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ host: "deliveryfix-help.localhost:3000", label: "deliveryfix-help", url: "https://deliveryfix-help.localhost:3000", user_action: "received_link", source: "sms", watch: true, verdict: "likely_scam" });
    expect(e[0].field_types).toEqual([]);
    expect(e[0].sender_hash).toMatch(/^[0-9a-f]{32}$/);
    expect(e[0].sender_hash).not.toContain("5550147");
    const msgs = (await t.pool.query("SELECT direction, body, meta FROM messages WHERE user_id=$1 ORDER BY created_at", [MAYA_ID])).rows;
    expect(msgs[0]).toMatchObject({ direction: "in", body: "[discarded]", meta: { reported: true } });
    expect(msgs.at(-1).body).toMatch(/^I saved deliveryfix-help\.localhost:3000 from that text, not the text itself\./);
    expect(msgs.at(-1).meta).toMatchObject({ source: "sms", exposure_id: e[0].id, actions: ["HOLD", "SAFE"] });
    // Nothing of the text survives: not in messages, not in the exposure, not in the agent trace.
    const leaks = await t.pool.query("SELECT (SELECT count(*) FROM messages WHERE body ILIKE '%redelivery%') m, (SELECT count(*) FROM agent_steps WHERE input_summary ILIKE '%ParcelPoint%' OR input_summary ILIKE '%redelivery%') s");
    expect(leaks.rows[0]).toEqual({ m: "0", s: "0" });
    // Reporting the same text again reuses the exposure.
    await reportText(new Request("http://x/api/demo/scam-text", { method: "POST", headers: { "content-type": "application/json", ...sessionCookie() }, body: JSON.stringify({ id: "deliveryfix" }) }));
    expect((await t.pool.query("SELECT count(*) n FROM exposures")).rows[0].n).toBe("1");

    // A later charge from that site links back to the text, and the alert and dispute say so.
    const posted = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: "deliveryfix-help" })!);
    await sendChargeAlert(t.pool, MAYA_ID, posted.id, e[0].id);
    expect((await t.pool.query("SELECT body FROM messages WHERE event_key=$1", [`charge:${posted.id}`])).rows[0].body)
      .toMatch(/^\$19\.99 from DLVRYFX HELP matches deliveryfix-help\.localhost:3000, the link in the scam text you reported on .+\. Reply DISPUTE and I'll draft it\.$/);
    const r = await handleInbound(t.pool, msg("DISPUTE", "phone-preview"), { userId: MAYA_ID });
    expect(r.reply).toContain(`/charges/${posted.id}`);
    const d = (await t.pool.query("SELECT exposure_id, timeline, letter FROM disputes WHERE txn_id=$1", [posted.id])).rows[0];
    expect(d.exposure_id).toBe(e[0].id);
    expect(d.timeline.map((x: { kind: string }) => x.kind)).toEqual(["text", "alert", "charge"]);
    expect(d.letter).toContain("I received a text message with a link to deliveryfix-help.localhost:3000");
  });

  it("reported texts are never read as commands; a legit text leaves no exposure; unknown ids 404; the inbox hides the answers", async () => {
    const legit = await reportText(new Request("http://x/api/demo/scam-text", { method: "POST", headers: { "content-type": "application/json", ...sessionCookie() }, body: JSON.stringify({ id: "bakery" }) }));
    expect((await legit.json()).reply).toMatch(/^Looks OK/);
    expect((await t.pool.query("SELECT count(*) n FROM exposures")).rows[0].n).toBe("0");
    const bad = await reportText(new Request("http://x/api/demo/scam-text", { method: "POST", headers: { "content-type": "application/json", ...sessionCookie() }, body: JSON.stringify({ id: "nope" }) }));
    expect(bad.status).toBe(404);
    const inbox = await (await listInbox(new Request("http://x/api/demo/scam-text", { headers: sessionCookie() }))).json();
    expect(inbox.texts.length).toBeGreaterThanOrEqual(4);
    expect(inbox.texts[0]).not.toHaveProperty("scam");
    expect(inbox.texts.find((x: { id: string }) => x.id === "tollpay").body).toContain("http://tollpay-tx.localhost:3000/pay");
    const asCommand = await handleInbound(t.pool, msg("HELP"), { userId: MAYA_ID, report: { sender: "72684" } });
    expect(asCommand.reply).not.toContain("Replies:");
  });

  it("the synthetic inbox: scam texts score as scams on the rules path, legit ones as OK", async () => {
    for (const x of scamTexts()) {
      const v = basicVerdictFor({ kind: "message", userId: MAYA_ID, text: x.body, source: "sms" });
      expect(v.verdict === "likely_scam", x.id).toBe(x.scam);
    }
    expect(scamTexts().filter((x) => x.storeSlug).map((x) => x.body)).toEqual([expect.stringContaining("deliveryfix-help.localhost:3000/track"), expect.stringContaining("tollpay-tx.localhost:3000/pay")]);
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
