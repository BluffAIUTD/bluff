import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";

vi.mock("@/lib/safesignal", () => ({
  alertScanSummary: vi.fn(async () => {}),
  alertNewCharge: vi.fn(async () => {}),
  cardHold: vi.fn(async () => ({ held: false, since: null })),
}));

import { createTestDb, sessionCookie } from "./testdb";
import { diskFetcher } from "./diskFetcher";
import { closePool, getPool } from "@/lib/db";
import { ensureAccount } from "@/lib/accounts";
import * as safesignal from "@/lib/safesignal";
import { forgetNessieCache } from "@/lib/nessie/cache";
import type { NessiePurchase } from "@/lib/nessie/client";
import { chicagoDate, pushRef, splitRef } from "@/lib/nessie/ref";
import { clampDollars, HOLD_MESSAGE, resetPushLimits, takePushToken } from "@/lib/nessie/push";
import { insertNessieRows, withNessieLock } from "@/lib/nessie/rows";
import { mirroredTs, syncFromNessie } from "@/lib/nessie/sync";
import { startBankScan, subscribeScan, type ScanEvent } from "@/lib/scan";
import { topFinding } from "@/lib/scan/result";
import { resetWatch, watchCard } from "@/lib/scan/watch";
import { scanWebsite } from "@/lib/scan/site";
import { basicVerdict } from "@/lib/scan/basic";
import { POST as pushRoute } from "@/app/api/scan/push/route";
import { POST as watchRoute } from "@/app/api/scan/watch/route";
import { LIVE_PUSH_PRESETS, livePushPreset, NESSIE_SEED } from "@/data/nessieSeed";

// ---- a fake Capital One Nessie ---------------------------------------------------------------------------------------
type Call = { method: string; path: string; body?: Record<string, unknown> };
const DAY = 86_400_000;
const ymd = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);
let calls: Call[] = [];
let failPurchasePost = 0;
const nessie = {
  customers: [{ _id: "c1", first_name: "Maya", last_name: "Patel", address: { street_number: "800", street_name: "W Campbell Rd", city: "Richardson", state: "TX", zip: "75080" } }],
  accounts: [{ _id: "a1", type: "Credit Card", nickname: "Quicksilver", rewards: 0, balance: 1200, account_number: "4417000012344778", customer_id: "c1" }],
  merchants: new Map<string, { _id: string; name: string; category: string[] }>(),
  purchases: [] as NessiePurchase[],
};
const purchase = (id: string, merchantId: string, description: string, amount: number, date = ymd(3)): NessiePurchase =>
  ({ _id: id, type: "merchant", merchant_id: merchantId, payer_id: "a1", purchase_date: date, amount, status: "completed", medium: "balance", description });
function resetNessie() {
  nessie.merchants = new Map([
    ["m_volt", { _id: "m_volt", name: "VoltDeals Outlet", category: ["Electronics"] }],
    ["m_fk", { _id: "m_fk", name: "FastKicks LLC", category: ["Shopping"] }],
  ]);
  nessie.purchases = [
    purchase("p_volt", "m_volt", "VOLTDEALS OUTLET · voltdeals-outlet.demo", 189, ymd(5)),
    purchase("p_fk", "m_fk", "FKSHP*LLC · fastkicks-shop.demo", 50, ymd(2)),
  ];
  calls = [];
  failPurchasePost = 0;
}

let server: http.Server;
let t: Awaited<ReturnType<typeof createTestDb>>;
const VOLT_HOST = "voltdeals-outlet.localhost:3000";
const FK_HOST = "fastkicks-shop.localhost:3000";

beforeAll(async () => {
  t = await createTestDb("bluff_nessie_live_test", { seed: true });
  process.env.DATABASE_URL = t.url;
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (d) => (raw += d));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname;
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ method: req.method ?? "GET", path, body });
      const send = (status: number, b: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(b)); };
      if (url.searchParams.get("key") !== "test") return send(401, { message: "bad key" });
      let m: RegExpExecArray | null;
      if (req.method === "GET" && path === "/customers") return send(200, nessie.customers);
      if (req.method === "GET" && (m = /^\/customers\/([^/]+)\/accounts$/.exec(path))) return send(200, nessie.accounts.filter((a) => a.customer_id === m![1]));
      if (req.method === "GET" && (m = /^\/accounts\/([^/]+)\/purchases$/.exec(path))) return nessie.accounts.some((a) => a._id === m![1]) ? send(200, nessie.purchases) : send(404, { message: "no account" });
      if (req.method === "POST" && (m = /^\/accounts\/([^/]+)\/purchases$/.exec(path))) {
        if (!nessie.accounts.some((a) => a._id === m![1])) return send(404, { code: 404, message: "Invalid account" });
        if (failPurchasePost) return send(failPurchasePost, { code: failPurchasePost, message: "boom" });
        const p = { ...body, _id: randomUUID(), type: "merchant", payer_id: m[1] } as NessiePurchase;
        nessie.purchases.push(p);
        return send(201, { code: 201, message: "Created purchase", objectCreated: p });
      }
      if (req.method === "GET" && path === "/merchants") return send(200, [...nessie.merchants.values()]);
      if (req.method === "GET" && (m = /^\/merchants\/([^/]+)$/.exec(path))) return nessie.merchants.has(m[1]) ? send(200, nessie.merchants.get(m[1])) : send(404, { message: "no merchant" });
      if (req.method === "POST" && path === "/merchants") {
        const id = `m_${randomUUID().slice(0, 6)}`;
        nessie.merchants.set(id, { ...body, _id: id });
        return send(201, { code: 201, message: "Created merchant", objectCreated: nessie.merchants.get(id) });
      }
      return send(403, { message: "Missing Authentication Token" });
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.NESSIE_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.NESSIE_API_KEY = "test";
  delete process.env.NESSIE_CUSTOMER_ID;
  // Crawls of the two demo stores from disk: scans reuse them (6 h) instead of hitting localhost:3000.
  const { MAYA_ID } = await import("@/lib/config");
  await scanWebsite(t.pool, MAYA_ID, { website: VOLT_HOST, merchant: "VoltDeals Outlet", crawl: { fetcher: diskFetcher } });
  await scanWebsite(t.pool, MAYA_ID, { website: FK_HOST, merchant: "FastKicks LLC", crawl: { fetcher: diskFetcher } });
});
afterAll(async () => {
  server.closeAllConnections?.(); server.close();
  delete process.env.NESSIE_BASE_URL; delete process.env.NESSIE_API_KEY;
  await closePool(); await t.drop();
});
beforeEach(() => {
  resetNessie();
  forgetNessieCache();
  resetPushLimits();
  resetWatch();
  vi.mocked(safesignal.alertNewCharge).mockClear();
  vi.mocked(safesignal.alertScanSummary).mockClear();
  vi.mocked(safesignal.cardHold).mockClear();
});

const newUser = async () => { const id = randomUUID(); await ensureAccount(getPool(), id); return id; };
const post = (url: string, body: unknown, uid: string) =>
  new Request(`http://x${url}`, { method: "POST", headers: { "content-type": "application/json", ...sessionCookie(uid) }, body: JSON.stringify(body) });
function untilDone(scanId: string, uid: string): Promise<ScanEvent[]> {
  return new Promise((resolve, reject) => {
    const ev: ScanEvent[] = [];
    const timer = setTimeout(() => reject(new Error("scan did not finish")), 15_000);
    const u = subscribeScan(scanId, uid, (e) => { ev.push(e); if (e.type === "done") { clearTimeout(timer); resolve(ev); } });
    if (!u) reject(new Error("scan not found"));
  });
}
const nessieRows = (uid: string) => t.pool.query("SELECT id, external_id, descriptor, website, amount_cents, ts FROM transactions WHERE user_id=$1 AND source='nessie' ORDER BY ts DESC", [uid]).then((r) => r.rows);

// ---- pure helpers -------------------------------------------------------------------------------------------------------
describe("live push helpers", () => {
  it("tags purchases with an 8-char HMAC ref and strips it again", () => {
    const a = pushRef("00000000-0000-4000-8000-0000000000aa");
    expect(a).toMatch(/^[0-9a-f]{8}$/);
    expect(pushRef("00000000-0000-4000-8000-0000000000bb")).not.toBe(a);
    expect(splitRef(`VOLTDEALS OUTLET · voltdeals-outlet.demo · ref ${a}`)).toEqual({ text: "VOLTDEALS OUTLET · voltdeals-outlet.demo", ref: a });
    expect(splitRef("NETFLIX.COM · netflix.com")).toEqual({ text: "NETFLIX.COM · netflix.com", ref: null });
  });
  it("amounts are whole dollars between 1 and 999; dates are Chicago calendar days", () => {
    expect([clampDollars(0), clampDollars(189.6), clampDollars(5000), clampDollars(Number.NaN)]).toEqual([1, 190, 999, 1]);
    expect(chicagoDate(new Date("2026-11-08T03:00:00Z"))).toBe("2026-11-07"); // 9 pm in Dallas
    expect(chicagoDate(new Date("2026-11-08T18:00:00Z"))).toBe("2026-11-08");
  });
  it("a same-day purchase never lands in the future", () => {
    const now = new Date("2026-11-07T15:00:00Z");
    expect(mirroredTs("2026-11-07", now)).toEqual(now);
    expect(mirroredTs("2026-11-01", now).toISOString()).toBe("2026-11-01T18:00:00.000Z");
  });
  it("presets are seed merchants and resolve by key, seed key or store slug", () => {
    for (const p of LIVE_PUSH_PRESETS) expect(NESSIE_SEED.some((m) => m.key === p.seedKey), p.key).toBe(true);
    expect(livePushPreset("voltdeals-outlet")?.merchant.website).toBe("voltdeals-outlet.demo");
    expect(livePushPreset("voltdeals")?.preset.key).toBe("voltdeals-outlet");
    expect(livePushPreset("bayou-bakery")).toBeNull();
    expect(LIVE_PUSH_PRESETS.filter((p) => p.group === "scam_demo").map((p) => p.key).sort()).toEqual(["cinevault-trial", "deliveryfix-help", "fastkicks-shop", "tollpay-tx", "voltdeals-outlet"]);
  });
  it("6 pushes per 10 minutes per visitor", () => {
    for (let i = 0; i < 6; i++) expect(takePushToken("u1").ok).toBe(true);
    const r = takePushToken("u1");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.scope).toBe("user");
    expect(takePushToken("u2").ok).toBe(true);
  });
  it("topFinding picks the most severe risk, or the first good sign for a safe site", () => {
    const report = { score: 20, label: "likely_scam", confidence: 0.8, category: "fake_store", findings: [
      { id: "a", severity: "low", title: "Low thing", detail: "" }, { id: "b", severity: "high", title: "Domain is 20 days old", detail: "" }, { id: "c", severity: "good", title: "Has HTTPS", detail: "" },
    ], stats: { pages: 3 } } as unknown as Parameters<typeof basicVerdict>[0];
    expect(topFinding(basicVerdict(report), report)).toBe("Domain is 20 days old");
    const ok = { ...basicVerdict(report), verdict: "looks_ok" as const, mode: "basic" as const };
    expect(topFinding(ok, report)).toBe("Has HTTPS");
  });
});

// ---- sync: privacy, idempotency ------------------------------------------------------------------------------------------
describe("sync from Nessie", () => {
  it("skips purchases pushed by other visitors, shows untagged ones to everyone, and strips the visitor's own ref", async () => {
    const a = await newUser(), b = await newUser();
    nessie.purchases.push(
      purchase("p_a", "m_volt", `VOLTDEALS OUTLET · voltdeals-outlet.demo · ref ${pushRef(a)}`, 99, ymd(1)),
      purchase("p_b", "m_volt", `VOLTDEALS OUTLET · voltdeals-outlet.demo · ref ${pushRef(b)}`, 77, ymd(1)),
      purchase("p_postman", "m_fk", "FKSHP*LLC · fastkicks-shop.demo", 33, ymd(1)),
    );
    const s = await syncFromNessie(getPool(), a);
    expect(s.hidden).toBe(1);
    expect(s.firstSync).toBe(true);
    const rows = await nessieRows(a);
    expect(rows.map((r) => r.external_id).sort()).toEqual(["p_a", "p_fk", "p_postman", "p_volt"]);
    const own = rows.find((r) => r.external_id === "p_a")!;
    expect(own.descriptor).toBe("VOLTDEALS OUTLET");
    expect(own.website).toBe(VOLT_HOST);
    expect((await nessieRows(b)).length).toBe(0);
    await syncFromNessie(getPool(), b);
    expect((await nessieRows(b)).map((r) => r.external_id).sort()).toEqual(["p_b", "p_fk", "p_postman", "p_volt"]);
  });

  it("is idempotent, even for concurrent syncs, and reports only new rows", async () => {
    const u = await newUser();
    const [x, y] = await Promise.all([syncFromNessie(getPool(), u), syncFromNessie(getPool(), u)]);
    expect(x.inserted + y.inserted).toBe(2);
    expect((await nessieRows(u)).length).toBe(2);
    const again = await syncFromNessie(getPool(), u);
    expect(again.inserted).toBe(0);
    expect(again.firstSync).toBe(false);
    nessie.purchases.push(purchase("p_new", "m_fk", "FKSHP*LLC · fastkicks-shop.demo", 12, ymd(0)));
    const next = await syncFromNessie(getPool(), u);
    expect(next.newTxnIds).toHaveLength(1);
    const row = (await nessieRows(u)).find((r) => r.external_id === "p_new")!;
    expect(row.id).toBe(next.newTxnIds[0]);
    expect(new Date(row.ts).getTime()).toBeLessThanOrEqual(Date.now());
    // The store-level guard: a second insert of the same purchase is a no-op.
    const dup = await withNessieLock(getPool(), u, (c) => insertNessieRows(c, u, [{ externalId: "p_new", ts: new Date(), descriptor: "X", amountCents: 1, category: null, merchantName: "X", website: null }]));
    expect(dup).toEqual([]);
    const idx = await t.pool.query("SELECT 1 FROM pg_indexes WHERE indexname='transactions_user_external_uniq'");
    expect(idx.rowCount).toBe(1); // plain Postgres; skipped on a Timescale hypertable
  });

  it("migration 011 removes existing duplicates (keeping the row a dispute points to) and adds the unique index", async () => {
    const u = await newUser();
    await t.pool.query("DROP INDEX IF EXISTS transactions_user_external_uniq");
    const ins = (ts: string) => t.pool.query("INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,source,external_id) VALUES ($1,$2,'X','x',100,'nessie','dup1') RETURNING id", [ts, u]).then((r) => r.rows[0].id as string);
    await ins("2026-11-01T18:00:00Z");
    const disputed = await ins("2026-11-02T18:00:00Z");
    await ins("2026-11-03T18:00:00Z");
    await t.pool.query("INSERT INTO disputes (user_id, txn_id, letter, generated_by) VALUES ($1,$2,'draft','template')", [u, disputed]);
    await t.pool.query(fs.readFileSync(path.join(process.cwd(), "db/migrations/011_nessie_live.sql"), "utf8"));
    const left = await t.pool.query("SELECT id FROM transactions WHERE user_id=$1 AND external_id='dup1'", [u]);
    expect(left.rows.map((r) => r.id)).toEqual([disputed]);
    expect((await t.pool.query("SELECT 1 FROM pg_indexes WHERE indexname='transactions_user_external_uniq'")).rowCount).toBe(1);
  });

  it("a cached purchase list read before a live push never deletes the pushed row", async () => {
    const u = await newUser();
    await syncFromNessie(getPool(), u, { maxAgeMs: 60_000 }); // caches the list
    const res = await pushRoute(post("/api/scan/push", { preset: "fastkicks-shop" }, u));
    expect(res.status).toBe(200);
    const { purchaseId, scanId } = await res.json();
    await untilDone(scanId, u);
    await syncFromNessie(getPool(), u, { maxAgeMs: 60_000 }); // same (older) list: no purchaseId in it
    expect((await nessieRows(u)).some((r) => r.external_id === purchaseId)).toBe(true);
  });
});

// ---- POST /api/scan/push ---------------------------------------------------------------------------------------------
describe("live push", () => {
  it("posts the right payload, inserts the local row, scans only that merchant and texts about the new charge", async () => {
    const u = await newUser();
    const res = await pushRoute(post("/api/scan/push", { preset: "voltdeals-outlet", amount: 189.4, fresh: false }, u));
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ preset: "voltdeals-outlet", merchant: "VoltDeals Outlet", amount: 189, purchaseDate: chicagoDate(), card: { nickname: "Quicksilver", last4: "4778" } });

    const posted = calls.filter((c) => c.method === "POST" && c.path === "/accounts/a1/purchases");
    expect(posted).toHaveLength(1);
    expect(posted[0].body).toEqual({
      merchant_id: "m_volt", medium: "balance", status: "completed", amount: 189, purchase_date: chicagoDate(),
      description: `VOLTDEALS OUTLET · voltdeals-outlet.demo · ref ${pushRef(u)}`,
    });
    expect(calls.some((c) => c.method === "POST" && c.path === "/merchants")).toBe(false); // found via the account's purchases

    const rows = await nessieRows(u);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: r.txnId, external_id: r.purchaseId, descriptor: "VOLTDEALS OUTLET", website: VOLT_HOST, amount_cents: 18900 });

    const ev = await untilDone(r.scanId, u);
    const m = ev.find((e) => e.type === "merchants") as Extract<ScanEvent, { type: "merchants" }>;
    expect(m.data.partial).toBe(true);
    expect(m.data.reason).toBe("push");
    expect(m.data.merchants.map((x) => x.key)).toEqual([VOLT_HOST]);
    expect(ev.some((e) => e.type === "basic")).toBe(true);
    expect(safesignal.alertScanSummary).not.toHaveBeenCalled();
    expect(safesignal.alertNewCharge).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(safesignal.alertNewCharge).mock.calls[0][1];
    expect(arg.userId).toBe(u);
    expect(arg.txnId).toBe(r.txnId);
    expect(arg.merchant).toMatchObject({ host: VOLT_HOST, merchant: "VoltDeals Outlet", descriptor: "VOLTDEALS OUTLET", mode: "basic", latestTxnId: r.txnId, txnIds: [r.txnId], totalCents: 18900 });
    expect(arg.merchant.label).toBe("likely_scam");
    expect(arg.merchant.topFinding).toBeTruthy();

    // A second push reuses the cached card and merchant ids: one Nessie call.
    calls = [];
    const again = await pushRoute(post("/api/scan/push", { preset: "voltdeals", amount: 20 }, u));
    expect(again.status).toBe(200);
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(["POST /accounts/a1/purchases"]);
    await untilDone((await again.json()).scanId, u);
  });

  it("a partial scan covers only the new charge's merchant, even when the card has others", async () => {
    const u = await newUser();
    await syncFromNessie(getPool(), u);
    const r = await (await pushRoute(post("/api/scan/push", { preset: "fastkicks-shop" }, u))).json();
    const ev = await untilDone(r.scanId, u);
    const m = ev.find((e) => e.type === "merchants") as Extract<ScanEvent, { type: "merchants" }>;
    expect(m.data.merchants.map((x) => x.key)).toEqual([FK_HOST]);
    expect(m.data.merchants[0].txns.map((x) => x.id)).toContain(r.txnId);
    expect(m.data.newTxnIds).toEqual([r.txnId]);
    expect(ev.filter((e) => e.type === "basic")).toHaveLength(1);
    expect(safesignal.alertNewCharge).toHaveBeenCalledTimes(1);
    expect(vi.mocked(safesignal.alertNewCharge).mock.calls[0][1].merchant.txnIds).toHaveLength(2);
  });

  it("a card on a Safe Signal hold is declined with 409 and nothing reaches Nessie", async () => {
    const u = await newUser();
    vi.mocked(safesignal.cardHold).mockResolvedValueOnce({ held: true, since: new Date().toISOString() });
    const res = await pushRoute(post("/api/scan/push", { preset: "voltdeals-outlet" }, u));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toEqual({ code: "card_on_hold", message: HOLD_MESSAGE });
    expect(safesignal.cardHold).toHaveBeenCalledWith(expect.anything(), u);
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(await nessieRows(u)).toHaveLength(0);
  });

  it("rejects unknown presets and maps Nessie failures to upstream_down", async () => {
    const u = await newUser();
    expect((await pushRoute(post("/api/scan/push", { preset: "evil-store" }, u))).status).toBe(400);
    failPurchasePost = 500;
    const res = await pushRoute(post("/api/scan/push", { preset: "target" }, u));
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("upstream_down");
    expect(await nessieRows(u)).toHaveLength(0);
  });

  it("re-resolves the card when the cached account is gone (sandbox reset)", async () => {
    const u = await newUser();
    await t.pool.query("INSERT INTO bluff_meta (key, value) VALUES ('nessie_card', $1) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
      [JSON.stringify({ customerId: "c1", accountId: "gone", name: "Maya Patel", nickname: "Quicksilver", last4: "0000" })]);
    const res = await pushRoute(post("/api/scan/push", { preset: "tollpay-tx" }, u));
    expect(res.status).toBe(200);
    const paths = calls.filter((c) => c.method === "POST").map((c) => c.path);
    expect(paths).toContain("/accounts/gone/purchases");
    expect(paths.at(-1)).toBe("/accounts/a1/purchases");
    expect(calls.some((c) => c.method === "POST" && c.path === "/merchants")).toBe(true); // TollPay wasn't on the fake card yet
    await untilDone((await res.json()).scanId, u);
  });
});

// ---- full scan and the card watcher -------------------------------------------------------------------------------------
describe("scans and the card watcher", () => {
  it("a full scan sends one summary with every merchant's result and no per-charge texts", async () => {
    const u = await newUser();
    const id = startBankScan(u);
    const ev = await untilDone(id, u);
    const m = ev.find((e) => e.type === "merchants") as Extract<ScanEvent, { type: "merchants" }>;
    expect(m.data.partial).toBeUndefined();
    expect(m.data.reason).toBe("full");
    expect(safesignal.alertNewCharge).not.toHaveBeenCalled();
    expect(safesignal.alertScanSummary).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(safesignal.alertScanSummary).mock.calls[0][1];
    expect(arg.scanId).toBe(id);
    expect(arg.merchants.map((x) => x.host).sort()).toEqual([FK_HOST, VOLT_HOST]);
    for (const x of arg.merchants) {
      expect(["likely_scam", "unsure", "looks_ok"]).toContain(x.label);
      expect(x.txnIds.length).toBeGreaterThan(0);
      expect(x.latestTxnId).toBe(x.txnIds[0]);
    }
  });

  it("an alert failure never breaks a scan", async () => {
    const u = await newUser();
    vi.mocked(safesignal.alertScanSummary).mockRejectedValueOnce(new Error("phone down"));
    const ev = await untilDone(startBankScan(u), u);
    expect(ev.at(-1)!.type).toBe("done");
  });

  it("links a new charge to the exposure where the card was typed", async () => {
    const u = await newUser();
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','voltdeals-outlet.bluffai.us','voltdeals-outlet',18,'likely_scam','continue',now() - interval '1 day','{card_number}')", [u]);
    const r = await (await pushRoute(post("/api/scan/push", { preset: "voltdeals-outlet" }, u))).json();
    const ev = await untilDone(r.scanId, u);
    const m = ev.find((e) => e.type === "merchants") as Extract<ScanEvent, { type: "merchants" }>;
    expect(m.data.merchants[0].link).toMatchObject({ host: "voltdeals-outlet.bluffai.us", userAction: "continue", kind: "flagged", txnId: r.txnId, fieldTypes: ["card_number"] });
  });

  it("watch: the first check imports the history without scanning; later checks scan only new purchases; polls are throttled", async () => {
    const u = await newUser();
    const now = Date.now();
    const first = await watchCard(u, now);
    expect(first).toMatchObject({ configured: true, firstSync: true, imported: 2, scanId: null, newTxnIds: [], throttled: false });
    expect(first.checkedAt).toBeTruthy();

    const n = calls.length;
    const throttled = await watchCard(u, now + 5_000);
    expect(throttled.throttled).toBe(true);
    expect(calls.length).toBe(n); // no Nessie call

    nessie.purchases.push(purchase("p_watch", "m_fk", "FKSHP*LLC · fastkicks-shop.demo", 41, chicagoDate()));
    nessie.purchases.push(purchase("p_old", "m_volt", "VOLTDEALS OUTLET · voltdeals-outlet.demo", 9, ymd(12))); // history, not a new charge
    forgetNessieCache("purchases"); // the shared 10 s list cache would otherwise answer
    const third = await watchCard(u, now + 16_000);
    expect(third.throttled).toBe(false);
    expect(third.imported).toBe(2);
    expect(third.newTxnIds).toHaveLength(1);
    expect(third.scanId).toBeTruthy();
    const ev = await untilDone(third.scanId!, u);
    const m = ev.find((e) => e.type === "merchants") as Extract<ScanEvent, { type: "merchants" }>;
    expect(m.data.reason).toBe("watch");
    expect(m.data.merchants.map((x) => x.key)).toEqual([FK_HOST]);
    expect(safesignal.alertNewCharge).toHaveBeenCalledTimes(1);
    expect(vi.mocked(safesignal.alertNewCharge).mock.calls[0][1].txnId).toBe(third.newTxnIds[0]);
  });

  it("watch: visitors share one purchase list read (~10 s), and the route answers with the scan to stream", async () => {
    const [a, b] = [await newUser(), await newUser()];
    await watchCard(a); await watchCard(b);
    expect(calls.filter((c) => c.path === "/accounts/a1/purchases")).toHaveLength(1);
    expect(calls.filter((c) => c.path === "/customers")).toHaveLength(1);
    resetWatch();
    const res = await watchRoute(post("/api/scan/watch", {}, a));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ configured: true, scanId: null, newTxnIds: [] });
  });
});
