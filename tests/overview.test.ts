import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./testdb";
import { MAYA_ID } from "../lib/config";
import { closePool } from "../lib/db";
import { headlineVerdict, loadOverview, summarizeScan, topReason, type ScanAttention } from "../lib/overview";
import type { Verdict } from "../lib/schemas";
import type { MerchantState } from "../lib/scan";

let t: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-11-07T18:00:00Z");
const DAY = 86_400_000;
// scanState reads through the app pool (DATABASE_URL), so point it at this test database.
beforeAll(async () => { t = await createTestDb("bluff_overview_test", { seed: true, now: NOW }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });

const verdict = (score: number, label: Verdict["verdict"], mode: Verdict["mode"], findings: { title: string; severity: "high" | "medium" | "low" | "good" | "info" }[] = []): Verdict => ({
  score, verdict: label, confidence: 0.8, confidence_reason: "test", category: "fake_store",
  evidence: ["First evidence line", "Second", "Third"], evidence_keys: [], next_steps: ["Do this", "Then that"], linked: {}, mode,
  analysis: findings.length ? { summary: "s", findings: findings.map((f) => ({ ...f, detail: "" })) } : undefined,
});

async function nessieCharge(host: string, merchant: string, descriptor: string, cents: number, ts: Date) {
  const r = await t.pool.query<{ id: string }>(
    `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, source, external_id, merchant_name, website)
     VALUES ($1,$2,$3,$4,$5,'nessie',$6,$7,$8) RETURNING id`, [ts, MAYA_ID, descriptor, descriptor.toLowerCase(), cents, `ext-${host}-${cents}`, merchant, host]);
  return r.rows[0].id;
}
const siteVerdict = (host: string, v: Verdict) =>
  t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'site',$2,$3,$4)", [MAYA_ID, host, JSON.stringify(v), v.mode]);

describe("overview", () => {
  it("seeded state, no bank scan yet: rule-flagged charges need attention (≤ 14 days), scan summary is empty", async () => {
    const o = await loadOverview(t.pool, MAYA_ID, NOW);
    expect(o.exposuresThisWeek).toBe(0);
    expect(o.scan).toMatchObject({ account: null, charges: 0, likelyScams: 0, riskyCharges: 0, atRiskCents: 0, lastScanAt: null });
    expect(o.hold.held).toBe(false);
    expect(o.needsAttention.length).toBeGreaterThan(0);
    expect(o.needsAttention.every((x) => x.kind === "rule")).toBe(true);
    expect(o.needsAttention.some((x) => x.flags.includes("card_test"))).toBe(true);
    expect(o.needsAttention.every((x) => x.kind === "rule" && Date.parse(x.ts) >= NOW.getTime() - 14 * DAY)).toBe(true);
  });

  it("counts this week's exposures and returns the 5 latest texts", async () => {
    for (let i = 0; i < 4; i++) await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at) VALUES ($1,'u',$2,$2,20,'likely_scam','continue',$3)", [MAYA_ID, `site${i}`, new Date(NOW.getTime() - i * DAY)]);
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at) VALUES ($1,'u','old','old',20,'likely_scam','continue',$2)", [MAYA_ID, new Date(NOW.getTime() - 20 * DAY)]);
    for (let i = 0; i < 7; i++) await t.pool.query("INSERT INTO messages (user_id,phone,direction,body,kind,status) VALUES ($1,'p','out',$2,'alert','sent')", [MAYA_ID, `m${i}`]);
    const o = await loadOverview(t.pool, MAYA_ID, NOW);
    expect(o.exposuresThisWeek).toBe(4);
    expect(o.alerts).toHaveLength(5);
    expect(Object.keys(o.alerts[0]).sort()).toEqual(["body", "createdAt", "id", "status"]);
  });

  it("after a bank scan: scan-flagged merchants lead Needs attention, with their rule flags merged in", async () => {
    // Nessie charges are dated relative to the real clock: scanState only reads the last 45 days.
    const now = new Date();
    const probe = await nessieCharge("voltdeals-outlet.test", "VoltDeals", "VOLTDEALS OUTLET", 100, new Date(now.getTime() - 5 * DAY)); // ≤ $2, new merchant → card_test
    const big = await nessieCharge("voltdeals-outlet.test", "VoltDeals", "VOLTDEALS OUTLET", 18900, new Date(now.getTime() - 2 * DAY));
    await nessieCharge("cinevault.test", "CineVault", "CINEVAULT*TRIAL", 6000, new Date(now.getTime() - 3 * DAY));
    await nessieCharge("books.toscrape.com", "Books to Scrape", "BOOKS TO SCRAPE", 2300, new Date(now.getTime() - 4 * DAY));
    await siteVerdict("voltdeals-outlet.test", verdict(14, "likely_scam", "live", [{ title: "Founded 2016 but domain is 20 days old", severity: "medium" }, { title: "Address is Suite 0", severity: "high" }]));
    await siteVerdict("cinevault.test", verdict(52, "unsure", "live"));
    await siteVerdict("books.toscrape.com", verdict(88, "looks_ok", "live"));
    await t.pool.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
      [`nessie_account:${MAYA_ID}`, JSON.stringify({ name: "Maya Lopez", nickname: "Credit Card ••4821", type: "Credit Card" })]);

    const o = await loadOverview(t.pool, MAYA_ID, now);
    expect(o.scan).toMatchObject({ account: "Maya Lopez · Credit Card ••4821", merchants: 3, charges: 4, likelyScams: 1, unsure: 1, riskyCharges: 2, atRiskCents: 100 + 18900 + 6000, scannedMerchants: 3, reviewedByNemotron: 3 });
    expect(Date.parse(o.scan.lastScanAt!)).toBeGreaterThan(now.getTime() - 60_000);

    const [first, second] = o.needsAttention as ScanAttention[];
    expect(first).toMatchObject({ kind: "scan", merchant: "VoltDeals", label: "likely_scam", score: 14, mode: "live", reason: "Address is Suite 0", totalCents: 19000, charges: 2, latestTxnId: big });
    expect(first.flags).toContain("card_test");
    expect(second).toMatchObject({ kind: "scan", merchant: "CineVault", label: "unsure" });
    expect(o.needsAttention.some((x) => x.kind === "scan" && x.merchant === "Books to Scrape")).toBe(false);
    // The card-test charge is shown on the VoltDeals row, not repeated as its own rule row.
    expect(o.needsAttention.some((x) => x.kind === "rule" && x.id === probe)).toBe(false);
    const firstRule = o.needsAttention.findIndex((x) => x.kind === "rule");
    expect(firstRule === -1 || firstRule >= 2).toBe(true);
  });
});

describe("scan summary helpers", () => {
  const basic = (v: Verdict) => ({ verdict: v, createdAt: "2026-11-07T10:00:00.000Z", report: { findings: [{ title: "Rules: high finding", severity: "high" }] } }) as unknown as MerchantState["basic"];
  const deep = (v: Verdict) => ({ verdict: v, runId: null, createdAt: "2026-11-07T11:00:00.000Z" });

  it("leads with the Nemotron review only when it ran live or was reused; a fallback shows the basic check", () => {
    const b = verdict(30, "likely_scam", "basic");
    expect(headlineVerdict({ basic: basic(b), deep: deep(verdict(80, "looks_ok", "live")) })?.score).toBe(80);
    expect(headlineVerdict({ basic: basic(b), deep: deep(verdict(80, "looks_ok", "cached")) })?.score).toBe(80);
    expect(headlineVerdict({ basic: basic(b), deep: deep(verdict(80, "looks_ok", "basic")) })?.score).toBe(30);
    expect(headlineVerdict({ basic: null, deep: null })).toBeNull();
  });

  it("top reason: a high finding first, then medium, else the first evidence line", () => {
    expect(topReason(verdict(10, "likely_scam", "live", [{ title: "m", severity: "medium" }, { title: "h", severity: "high" }]))).toBe("h");
    expect(topReason(verdict(10, "likely_scam", "live", [{ title: "g", severity: "good" }]))).toBe("First evidence line");
    expect(topReason(verdict(10, "likely_scam", "basic"), { basic: basic(verdict(10, "likely_scam", "basic")) })).toBe("Rules: high finding");
  });

  it("counts a merchant with only a basic check as scanned but not reviewed by Nemotron", () => {
    const m = { key: "k", merchant: "M", host: "m.test", descriptor: "M", category: null, txns: [{ id: "t1", ts: "2026-11-06T18:00:00.000Z", amountCents: 500 }], totalCents: 500 };
    const { summary, flagged } = summarizeScan({ merchants: [{ ...m, basic: basic(verdict(20, "likely_scam", "basic")), deep: null }], deepAvailable: false, configured: true, account: null, lastSyncAt: null });
    expect(summary).toMatchObject({ likelyScams: 1, riskyCharges: 1, atRiskCents: 500, scannedMerchants: 1, reviewedByNemotron: 0, lastScanAt: "2026-11-07T10:00:00.000Z" });
    expect(flagged[0]).toMatchObject({ mode: "basic", latestTxnId: "t1", reason: "Rules: high finding" });
  });
});
