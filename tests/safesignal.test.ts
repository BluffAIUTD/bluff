import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { alertNewCharge, alertScanSummary, cardHold, setCardHold, type ScanAlertMerchant } from "../lib/safesignal";
import { notify, MAX_ALERTS_PER_HOUR } from "../lib/messaging/notify";
import { handleInbound } from "../lib/messaging/inbound";
import { newChargeAlert, scanSummaryAlert, usd } from "../lib/messaging/templates";
import { getTransactionWithFlags, listTransactionsWithFlags } from "../lib/rules/flags";
import { isRiskySite } from "../lib/disputes";
import { normalizeDescriptor } from "../lib/linker/normalize";
import { GET as getMessages } from "../app/api/messages/route";
import { sessionCookie } from "./testdb";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_safesignal_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.AGENT_MODE = "mock";
  for (const tbl of ["messages", "disputes", "exposures", "site_scans"]) await t.pool.query(`DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM allowlist WHERE user_id IS NOT NULL");
  await t.pool.query("DELETE FROM verdicts WHERE subject_type='site'");
  await t.pool.query("DELETE FROM transactions WHERE external_id LIKE 'test_%'");
  await t.pool.query("UPDATE users SET alerts_paused=false, card_hold_at=NULL");
});

const VOLT = "voltdeals-outlet.localhost:3000";
const CINE = "cinevault-trial.localhost:3000";
const BOOKS = "books.toscrape.com";
let ext = 0;
async function nessieTxn(descriptor: string, website: string, cents: number, daysAgo: number): Promise<string> {
  return (await t.pool.query(
    "INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,source,external_id,merchant_name,website) VALUES (now() - ($1 || ' days')::interval,$2,$3,$4,$5,'nessie',$6,$3,$7) RETURNING id",
    [String(daysAgo), MAYA_ID, descriptor, normalizeDescriptor(descriptor), cents, `test_${++ext}`, website],
  )).rows[0].id;
}
const merchant = (o: Partial<ScanAlertMerchant> & Pick<ScanAlertMerchant, "host" | "descriptor" | "txnIds">): ScanAlertMerchant => ({
  merchant: o.descriptor, label: "likely_scam", score: 12, confidence: 0.82, mode: "live", topFinding: "Domain registered 21 days ago but claims to be founded in 2016",
  latestTxnId: o.txnIds[0], totalCents: 18900, ...o,
});
const alerts = async () => (await t.pool.query("SELECT body, meta, event_key FROM messages WHERE direction='out' AND kind='alert' ORDER BY created_at")).rows;

describe("alertScanSummary", () => {
  it("one text listing the risky merchants, newest charge first; re-running the same scan the same day doesn't re-send", async () => {
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 1);
    const trial = await nessieTxn("CINEVAULT*TRIAL", CINE, 100, 9);
    const cine = await nessieTxn("CINEVAULT*TRIAL", CINE, 6000, 6);
    const books = await nessieTxn("BOOKS TO SCRAPE", BOOKS, 2300, 2);
    const merchants = [
      merchant({ host: CINE, descriptor: "CINEVAULT*TRIAL", txnIds: [cine, trial], score: 28, totalCents: 6100 }),
      merchant({ host: BOOKS, descriptor: "BOOKS TO SCRAPE", txnIds: [books], label: "looks_ok", score: 88, totalCents: 2300 }),
      merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt], score: 12, totalCents: 18900 }),
    ];
    await alertScanSummary(t.pool, { userId: MAYA_ID, scanId: "s1", merchants });
    const a = await alerts();
    expect(a).toHaveLength(1);
    expect(a[0].body).toBe("Bluff checked the websites behind 3 merchants on your Capital One card. 2 look like scams: VOLTDEALS OUTLET $189 (score 12) and CINEVAULT*TRIAL $61 over 2 charges (score 28). Reply DISPUTE to draft a dispute for the newest, HOLD to pause new online charges, or SAFE if you recognize it.");
    expect(a[0].meta).toMatchObject({ source: "scan", txn_id: volt, host: VOLT, actions: ["DISPUTE", "HOLD", "SAFE"] });
    expect(a[0].meta.txn_ids).toEqual(expect.arrayContaining([volt, cine, trial]));
    await alertScanSummary(t.pool, { userId: MAYA_ID, scanId: "s2", merchants });
    expect(await alerts()).toHaveLength(1);
  });

  it("nothing risky → no text; unsure below 50 counts as risky, unsure 60 doesn't; a host marked SAFE is left out", async () => {
    const books = await nessieTxn("BOOKS TO SCRAPE", BOOKS, 2300, 2);
    await alertScanSummary(t.pool, { userId: MAYA_ID, scanId: "s", merchants: [merchant({ host: BOOKS, descriptor: "BOOKS TO SCRAPE", txnIds: [books], label: "looks_ok", score: 90 })] });
    expect(await alerts()).toHaveLength(0);
    expect(isRiskySite({ label: "unsure", score: 45 })).toBe(true);
    expect(isRiskySite({ label: "unsure", score: 60 })).toBe(false);
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 1);
    const cine = await nessieTxn("CINEVAULT*TRIAL", CINE, 6000, 3);
    await t.pool.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2)", [VOLT, MAYA_ID]);
    await alertScanSummary(t.pool, { userId: MAYA_ID, scanId: "s", merchants: [
      merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt] }),
      merchant({ host: CINE, descriptor: "CINEVAULT*TRIAL", txnIds: [cine], label: "unsure", score: 45, totalCents: 6000 }),
    ] });
    const a = await alerts();
    expect(a).toHaveLength(1);
    expect(a[0].body).toContain("1 looks risky: CINEVAULT*TRIAL $60 (score 45). Reply DISPUTE to draft a dispute, HOLD");
    expect(a[0].body).not.toContain("VOLTDEALS");
  });

  it("names at most 3 merchants and counts the rest", () => {
    const risky = ["A", "B", "C", "D", "E"].map((d, i) => ({ descriptor: d, amountCents: 1000 + i * 100, charges: 1, score: 10 + i, label: "likely_scam" as const }));
    expect(scanSummaryAlert({ merchantsChecked: 9, risky })).toContain("5 look like scams: A $10 (score 10), B $11 (score 11), C $12 (score 12) and 2 more.");
    expect(usd(199)).toBe("$1.99");
    expect(usd(18900)).toBe("$189");
  });
});

describe("alertNewCharge", () => {
  it("risky new charge: amount, merchant, host, score, confidence as given, top finding; one text per charge", async () => {
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 0);
    const m = merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt] });
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: volt, merchant: m });
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: volt, merchant: m });
    const a = await alerts();
    expect(a).toHaveLength(1);
    expect(a[0].body).toBe(`New charge: $189 at VOLTDEALS OUTLET on your Capital One card. Bluff read ${VOLT} and it looks like a scam (score 12/100, 82% sure): Domain registered 21 days ago but claims to be founded in 2016. Reply DISPUTE, HOLD or SAFE.`);
    expect(a[0].event_key).toBe(`charge:${volt}`);
    expect(a[0].meta).toMatchObject({ source: "scan", txn_id: volt, host: VOLT, actions: ["DISPUTE", "HOLD", "SAFE"] });
  });

  it("basic mode is labeled; looks_ok and SAFE hosts stay silent", async () => {
    const cine = await nessieTxn("CINEVAULT*TRIAL", CINE, 6000, 0);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: cine, merchant: merchant({ host: CINE, descriptor: "CINEVAULT*TRIAL", txnIds: [cine], label: "unsure", score: 44, confidence: 0.61, mode: "basic", topFinding: null }) });
    expect((await alerts())[0].body).toBe(`New charge: $60 at CINEVAULT*TRIAL on your Capital One card. Bluff read ${CINE} and it looks risky (score 44/100, 61% sure). Reply DISPUTE, HOLD or SAFE. (basic check)`);
    const books = await nessieTxn("BOOKS TO SCRAPE", BOOKS, 2300, 0);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: books, merchant: merchant({ host: BOOKS, descriptor: "BOOKS TO SCRAPE", txnIds: [books], label: "looks_ok", score: 91 }) });
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 0);
    await t.pool.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2)", [VOLT, MAYA_ID]);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: volt, merchant: merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt] }) });
    expect(await alerts()).toHaveLength(1);
  });

  it("says when the charge matches a scam text the user reported, or a site where they entered their card", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,source,watch,created_at) VALUES ($1,'https://deliveryfix-help.localhost:3000','deliveryfix-help.localhost:3000','deliveryfix-help',22,'likely_scam','received_link','sms',true, now() - interval '2 days')", [MAYA_ID]);
    const fix = await nessieTxn("DLVRYFX HELP", "deliveryfix-help.localhost:3000", 2000, 0);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: fix, merchant: merchant({ host: "deliveryfix-help.localhost:3000", descriptor: "DLVRYFX HELP", txnIds: [fix], score: 15 }) });
    const a = await alerts();
    expect(a[0].body).toMatch(/It matches the link in the scam text you reported on [A-Z][a-z]{2} \d{1,2}\. Reply DISPUTE, HOLD or SAFE\.$/);
    expect(a[0].meta.exposure_id).toBeTruthy();
    expect(newChargeAlert({ amountCents: 4999, descriptor: "FKSHP*LLC", host: "fastkicks-shop.bluffai.us/shop/", label: "likely_scam", score: 18, confidence: 0.9, topFinding: null, basic: false, linked: { via: "entered", at: "2026-11-04T18:00:00Z", fieldTypes: ["card_number", "cvv"] } }))
      .toBe("New charge: $49.99 at FKSHP*LLC on your Capital One card. Bluff read fastkicks-shop.bluffai.us and it looks like a scam (score 18/100, 90% sure). It matches the site where you entered your card and card security code on Nov 4. Reply DISPUTE, HOLD or SAFE.");
    expect(newChargeAlert({ amountCents: 1240, descriptor: "TOLLPAY*TX 0412", host: "merchant:tollpay*tx 0412", label: "unsure", score: 41, confidence: 0.55, topFinding: null, basic: true }))
      .toBe("New charge: $12.40 at TOLLPAY*TX 0412 on your Capital One card. Bluff couldn't find a website for this merchant, and the charge looks risky (score 41/100, 55% sure). Reply DISPUTE, HOLD or SAFE. (basic check)");
  });

  it("never throws, even for junk input", async () => {
    await expect(alertNewCharge(t.pool, { userId: MAYA_ID, txnId: "not-a-uuid", merchant: merchant({ host: VOLT, descriptor: "X", txnIds: ["x"] }) })).resolves.toBeUndefined();
    await expect(alertScanSummary(t.pool, { userId: MAYA_ID, scanId: "s", merchants: [merchant({ host: VOLT, descriptor: "X", txnIds: ["nope"], latestTxnId: "nope" })] })).resolves.toBeUndefined();
  });
});

describe("alert cap and STOP", () => {
  it(`a demo's worth of alerts fits under the cap (${MAX_ALERTS_PER_HOUR}/hour); the next one is rate limited; STOP pauses alerts, START resumes`, async () => {
    expect(MAX_ALERTS_PER_HOUR).toBe(12);
    for (let i = 0; i < MAX_ALERTS_PER_HOUR; i++) expect((await notify(t.pool, { userId: MAYA_ID, eventKey: `cap${i}`, body: "x" })).status).toBe("delivered");
    expect(await notify(t.pool, { userId: MAYA_ID, eventKey: "cap-over", body: "x" })).toEqual({ status: "skipped", reason: "rate_limited" });
    await t.pool.query("DELETE FROM messages");
    await handleInbound(t.pool, { from: "phone-preview", text: "STOP", providerId: `stop_${Date.now()}`, hasImage: false }, { userId: MAYA_ID });
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 0);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: volt, merchant: merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt] }) });
    expect(await alerts()).toHaveLength(0);
    const r = await handleInbound(t.pool, { from: "phone-preview", text: "start", providerId: `start_${Date.now()}`, hasImage: false }, { userId: MAYA_ID });
    expect(r.reply).toMatch(/Alerts are back on/);
    await alertNewCharge(t.pool, { userId: MAYA_ID, txnId: volt, merchant: merchant({ host: VOLT, descriptor: "VOLTDEALS OUTLET", txnIds: [volt] }) });
    expect(await alerts()).toHaveLength(1);
  });
});

describe("Safe Signal hold", () => {
  it("cardHold reflects HOLD / UNHOLD; the start time is kept; /api/messages reports it to the phone", async () => {
    expect(await cardHold(t.pool, MAYA_ID)).toEqual({ held: false, since: null });
    const on = await setCardHold(t.pool, MAYA_ID, true);
    expect(on).toMatchObject({ held: true, changed: true });
    expect((await setCardHold(t.pool, MAYA_ID, true))).toMatchObject({ held: true, since: on.since, changed: false });
    const res = await getMessages(new Request("http://x/api/messages", { headers: sessionCookie() }));
    expect((await res.json()).hold).toEqual({ held: true, since: on.since });
    expect(await setCardHold(t.pool, MAYA_ID, false)).toEqual({ held: false, since: null, changed: true });
    expect(await cardHold(t.pool, "00000000-0000-4000-8000-0000000000aa")).toEqual({ held: false, since: null });
  });
});

describe("risky_site flag", () => {
  it("flags a charge whose merchant website the bank scan rated risky (deep verdict, else the basic check); not when OK or marked SAFE", async () => {
    const volt = await nessieTxn("VOLTDEALS OUTLET", VOLT, 18900, 1);
    const cine = await nessieTxn("CINEVAULT*TRIAL", CINE, 6000, 1);
    const books = await nessieTxn("BOOKS TO SCRAPE", BOOKS, 2300, 1);
    const v = (score: number, verdict: string) => JSON.stringify({ score, verdict, confidence: 0.8, confidence_reason: "x", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["a", "b"], linked: {}, mode: "live" });
    await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'site',$2,$3,'live'), ($1,'site',$4,$5,'live')", [MAYA_ID, VOLT, v(12, "likely_scam"), BOOKS, v(88, "looks_ok")]);
    // CineVault: only a crawl (no deep review), its basic check says likely scam.
    await t.pool.query("INSERT INTO site_scans (user_id, host, merchant, crawl, intel, basic) VALUES ($1,$2,'CineVault',$3,'{}',$4)",
      [MAYA_ID, CINE, JSON.stringify({ origin: `http://${CINE}` }), JSON.stringify({ score: 22, label: "likely_scam", confidence: 0.7, category: "subscription_trap", findings: [] })]);
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, volt))!.flags).toContain("risky_site");
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, cine))!.flags).toContain("risky_site");
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, books))!.flags).not.toContain("risky_site");
    const list = await listTransactionsWithFlags(t.pool, MAYA_ID, 200);
    expect(list.filter((r) => r.flags.includes("risky_site")).map((r) => r.id).sort()).toEqual([volt, cine].sort());
    await t.pool.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2)", [VOLT, MAYA_ID]);
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, volt))!.flags).not.toContain("risky_site");
  });
});
