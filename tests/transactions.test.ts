import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { GET as listTxns } from "../app/api/transactions/route";
import { GET as getTxn } from "../app/api/transactions/[id]/route";
import { POST as investigateTxn } from "../app/api/transactions/[id]/investigate/route";
import { POST as nextCharge } from "../app/api/demo/next-charge/route";
import { POST as resetDemo } from "../app/api/demo/reset/route";
import { POST as investigatePage } from "../app/api/investigate/page/route";
import { GET as streamRun } from "../app/api/runs/[runId]/stream/route";
import { POST as createExp } from "../app/api/exposures/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_txn_api_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.PHOTON_MODE = "mock"; process.env.DEMO_KEY = "k";
  await t.pool.query("DELETE FROM messages"); await t.pool.query("DELETE FROM exposures");
  await t.pool.query("DELETE FROM transactions WHERE user_id=$1 AND script_id IS NOT NULL", [MAYA_ID]);
});

const req = (url: string, method = "GET", body?: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://x${url}`, { method, headers: { "content-type": "application/json", ...headers }, body: body ? JSON.stringify(body) : undefined });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });
const events = async (runId: string) => (await (await streamRun(req("/s"), { params: Promise.resolve({ runId }) })).text()).split("\n\n").filter((b) => b.startsWith("event:")).map((b) => { const [e, d] = b.split("\n"); return { event: e.slice(7), data: JSON.parse(d.slice(6)) }; });
const waitFor = async (fn: () => Promise<boolean>, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };

async function exposeStore(host: string, action: "continue" | "watch" = "continue") {
  const { runId } = await (await investigatePage(req("/api/investigate/page", "POST", { url: host, host }))).json();
  const verdictId = (await events(runId)).at(-1)!.data.verdictId;
  return (await (await createExp(req("/api/exposures", "POST", { verdictId, url: `https://${host}`, host, fieldTypes: ["card_number"], action }))).json()).exposure;
}

describe("transactions API", () => {
  it("lists newest first with flags; limit is clamped", async () => {
    const r = await (await listTxns(req("/api/transactions?limit=5"))).json();
    expect(r.transactions).toHaveLength(5);
    const ts = r.transactions.map((x: { ts: string }) => Date.parse(x.ts));
    expect(ts).toEqual([...ts].sort((a, b) => b - a));
    const all = await (await listTxns(req("/api/transactions?limit=9999"))).json();
    expect(all.transactions.length).toBe(60);
    expect(all.transactions.some((x: { flags: string[] }) => x.flags.includes("card_test"))).toBe(true);
  });

  it("detail 404s for unknown/bad ids", async () => {
    expect((await getTxn(req("/x"), idp("00000000-0000-4000-8000-0000000000aa"))).status).toBe(404);
    expect((await getTxn(req("/x"), idp("nope"))).status).toBe(404);
    expect((await investigateTxn(req("/x", "POST"), idp("nope"))).status).toBe(404);
  });
});

describe("demo core loop: check → expose → simulate charge → link", () => {
  it("fastkicks-shop: charge posts 3 days after the exposure, links to it, streams a trace and alerts by iMessage", async () => {
    const exp = await exposeStore("fastkicks-shop", "watch");
    const r = await nextCharge(req("/api/demo/next-charge", "POST", { store: "fastkicks-shop" }));
    expect(r.status).toBe(201);
    const { transaction, runId, simulatedDelayDays, scriptId } = await r.json();
    expect(scriptId).toBe("txn_demo_link_1");
    expect(simulatedDelayDays).toBe(3);
    expect(transaction).toMatchObject({ descriptor: "FKSHP*LLC", amountCents: 4999 });
    expect(transaction.flags).toContain("exposure_link");

    const ev = await events(runId);
    expect(ev.filter((e) => e.event === "step").map((e) => e.data.tool)).toEqual([null, "txn_search", "exposure_lookup", "domain_intel", "submit_verdict"]);
    const verdict = ev.find((e) => e.event === "verdict")!.data;
    expect(verdict.linked.exposure_id).toBe(exp.id);
    expect(verdict.linked.match_reasons.join(" ")).toContain("charged 3 days after exposure");

    // detail endpoint has everything the charge page needs
    const d = await (await getTxn(req("/x"), idp(transaction.id))).json();
    expect(d.best.exposureId).toBe(exp.id);
    expect(d.verdict.linked.exposure_id).toBe(exp.id);
    expect(d.dispute).toBeNull();
    expect(d.transaction.scripted).toBe(true);

    // exposure alert (at check) + charge alert (at link), in the spec's wording
    expect(await waitFor(async () => Number((await t.pool.query("SELECT count(*) n FROM messages WHERE status='sent' AND kind='alert'")).rows[0].n) === 2)).toBe(true);
    const bodies = (await t.pool.query("SELECT body FROM messages WHERE kind='alert' ORDER BY created_at")).rows.map((x) => x.body);
    expect(bodies[1]).toMatch(/^\$49\.99 from FKSHP\*LLC matches fastkicks-shop, where you entered your card on [A-Z][a-z]{2} \d+\. Reply DISPUTE and I'll draft it\.$/);
  });

  it("posting the same store's charge twice is idempotent (no duplicate row)", async () => {
    await exposeStore("fastkicks-shop");
    const a = await (await nextCharge(req("/api/demo/next-charge", "POST", { store: "fastkicks-shop" }))).json();
    const b = await nextCharge(req("/api/demo/next-charge", "POST", { store: "fastkicks-shop" }));
    expect(b.status).toBe(200);
    expect((await b.json()).transaction.id).toBe(a.transaction.id);
  });

  it("legit store: charge is an 'expected charge', no iMessage alert for it", async () => {
    await exposeStore("bayou-bakery");
    const { transaction, runId } = await (await nextCharge(req("/api/demo/next-charge", "POST", { store: "bayou-bakery" }))).json();
    expect(transaction.flags).toContain("expected_charge");
    const v = (await events(runId)).find((e) => e.event === "verdict")!.data;
    expect(v.verdict).toBe("looks_ok");
    await new Promise((r) => setTimeout(r, 100));
    expect((await t.pool.query("SELECT 1 FROM messages")).rowCount).toBe(0);
  });

  it("without an exposure the charge posts now and is honestly unlinked", async () => {
    const { transaction, runId } = await (await nextCharge(req("/api/demo/next-charge", "POST", { store: "fastkicks-shop" }))).json();
    expect(transaction.flags).not.toContain("exposure_link");
    expect((await events(runId)).find((e) => e.event === "verdict")!.data.linked.exposure_id).toBeUndefined();
  });

  it("default trigger walks the script list in order; unknown store → 404; exhausting scripts → 404", async () => {
    const first = await (await nextCharge(req("/api/demo/next-charge", "POST"))).json();
    expect(first.scriptId).toBe("txn_demo_link_1");
    const second = await (await nextCharge(req("/api/demo/next-charge", "POST"))).json();
    expect(second.scriptId).toBe("txn_demo_link_2");
    expect((await nextCharge(req("/api/demo/next-charge", "POST", { store: "nope-store" }))).status).toBe(404);
    for (let i = 0; i < 12; i++) await nextCharge(req("/api/demo/next-charge", "POST"));
    const done = await nextCharge(req("/api/demo/next-charge", "POST"));
    expect(done.status).toBe(404);
    expect((await done.json()).error.message).toMatch(/Reset the demo/);
  });

  it("drift script flags price drift against the seeded streaming history", async () => {
    const { transaction } = await (await nextCharge(req("/api/demo/next-charge", "POST", { scriptId: "txn_demo_drift" }))).json();
    expect(transaction.flags).toContain("price_drift");
    const d = await (await getTxn(req("/x"), idp(transaction.id))).json();
    expect(d.priceHistory.length).toBeGreaterThanOrEqual(3);
  });

  it("investigate endpoint re-runs a charge", async () => {
    const { transaction } = await (await nextCharge(req("/api/demo/next-charge", "POST", { store: "tollpay-tx" }))).json();
    const { runId } = await (await investigateTxn(req("/x", "POST"), idp(transaction.id))).json();
    expect((await events(runId)).at(-1)!.event).toBe("done");
  });
});

describe("demo reset", () => {
  it("is locked in production without the key, works with it", async () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    process.env.SESSION_SECRET = "prod-secret";
    expect((await resetDemo(req("/api/demo/reset", "POST"))).status).toBe(403);
    expect((await resetDemo(req("/api/demo/reset", "POST", undefined, { "x-demo-key": "k" }))).status).toBe(204);
    // non-strict demo controls stay open on the judge path while DEMO_MODE=1
    const open = await nextCharge(req("/api/demo/next-charge", "POST", { store: "fastkicks-shop" }));
    expect(open.status).toBe(201);
    delete (process.env as Record<string, string>).NODE_ENV; delete process.env.SESSION_SECRET;
    expect((await t.pool.query("SELECT count(*) n FROM transactions WHERE user_id=$1", [MAYA_ID])).rows[0].n).toBe("61");
  });
});
