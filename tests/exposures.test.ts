import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as investigatePage } from "../app/api/investigate/page/route";
import { GET as streamRun } from "../app/api/runs/[runId]/stream/route";
import { GET as listExp, POST as createExp } from "../app/api/exposures/route";
import { PATCH as patchExp, DELETE as deleteExp } from "../app/api/exposures/[id]/route";
import { notify, MAX_ALERTS_PER_HOUR } from "../lib/photon/notify";
import { sendWithRetry } from "../lib/photon/send";
import { exposureAlert, chargeAlert, listFields } from "../lib/photon/templates";
import { normalizeDescriptor } from "../lib/linker/normalize";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_exposures_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.MOCK_SPEED = "0"; process.env.PHOTON_MODE = "mock"; delete process.env.PHOTON_MOCK_FAIL;
  await t.pool.query("DELETE FROM messages"); await t.pool.query("DELETE FROM exposures"); await t.pool.query("UPDATE users SET alerts_paused=false");
});

const req = (url: string, method: string, body?: unknown) => new Request(`http://x${url}`, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });

async function checkHost(host: string) {
  const { runId } = await (await investigatePage(req("/api/investigate/page", "POST", { url: host, host }))).json();
  const text = await (await streamRun(new Request("http://x/s"), { params: Promise.resolve({ runId }) })).text();
  const done = text.split("\n\n").filter((b) => b.startsWith("event: done")).map((b) => JSON.parse(b.split("\n")[1].replace("data: ", "")))[0];
  return done.verdictId as string;
}
const waitFor = async (fn: () => Promise<boolean>, ms = 3000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 25)); } return false; };

describe("exposures API", () => {
  it("scam store: creates an exposure from the verdict and queues an alert with the spec template", async () => {
    const verdictId = await checkHost("fastkicks-shop");
    const r = await createExp(req("/api/exposures", "POST", { verdictId, url: "https://fastkicks-shop", host: "fastkicks-shop", fieldTypes: ["card_number", "cvv"], action: "watch" }));
    expect(r.status).toBe(201);
    const { exposure, alert } = await r.json();
    expect(exposure).toMatchObject({ host: "fastkicks-shop", label: "fastkicks-shop", score: 18, watch: true, userAction: "watch", verdict: "likely_scam" });
    expect(alert).toBe("queued");
    expect(await waitFor(async () => (await t.pool.query("SELECT 1 FROM messages WHERE status='sent'")).rowCount === 1)).toBe(true);
    const msg = (await t.pool.query("SELECT body, meta, kind FROM messages")).rows[0];
    expect(msg.body).toBe("You just entered your card and card security code on fastkicks-shop, a site registered 4 days ago. Reply WATCH and I'll check for charges from it.");
    expect(msg.meta.exposure_id).toBe(exposure.id);
    expect(msg.kind).toBe("alert");
  });

  it("legit store: no alert; same host twice creates two exposures", async () => {
    const verdictId = await checkHost("bayou-bakery");
    const a = await (await createExp(req("/api/exposures", "POST", { verdictId, url: "https://bayou-bakery", host: "bayou-bakery", fieldTypes: ["card_number"], action: "continue" }))).json();
    const b = await (await createExp(req("/api/exposures", "POST", { verdictId, url: "https://bayou-bakery", host: "bayou-bakery", fieldTypes: ["card_number"], action: "continue" }))).json();
    expect(a.alert).toBeUndefined();
    expect(a.exposure.id).not.toBe(b.exposure.id);
    expect((await t.pool.query("SELECT 1 FROM messages")).rowCount).toBe(0);
    const list = await (await listExp(req("/api/exposures", "GET"))).json();
    expect(list.exposures).toHaveLength(2);
    expect(list.exposures[0].linkedCount).toBe(0);
  });

  it("rejects unknown verdicts and bad actions", async () => {
    let r = await createExp(req("/api/exposures", "POST", { verdictId: "00000000-0000-4000-8000-0000000000aa", url: "u", host: "h", action: "continue" }));
    expect(r.status).toBe(400);
    r = await createExp(req("/api/exposures", "POST", { verdictId: "x", url: "u", host: "h", action: "nope" }));
    expect(r.status).toBe(400);
  });

  it("PATCH toggles watch, DELETE removes, 404s for others/unknown; list counts linked charges", async () => {
    const verdictId = await checkHost("fastkicks-shop");
    const { exposure } = await (await createExp(req("/api/exposures", "POST", { verdictId, url: "u", host: "fastkicks-shop", fieldTypes: ["card_number"], action: "continue" }))).json();
    await t.pool.query("INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents) VALUES (now(),$1,'FKSHP*LLC',$2,4999)", [MAYA_ID, normalizeDescriptor("FKSHP*LLC")]);
    let list = await (await listExp(req("/api/exposures", "GET"))).json();
    expect(list.exposures[0].linkedCount).toBe(1);
    const p = await (await patchExp(req("/api/exposures/x", "PATCH", { watch: true }), idp(exposure.id))).json();
    expect(p.exposure.watch).toBe(true);
    expect((await patchExp(req("/x", "PATCH", { watch: true }), idp("00000000-0000-4000-8000-0000000000aa"))).status).toBe(404);
    expect((await deleteExp(req("/x", "DELETE"), idp(exposure.id))).status).toBe(204);
    expect((await deleteExp(req("/x", "DELETE"), idp(exposure.id))).status).toBe(404);
    list = await (await listExp(req("/api/exposures", "GET"))).json();
    expect(list.exposures).toHaveLength(0);
  });
});

describe("notify choke point", () => {
  const base = { userId: MAYA_ID, body: "hi" };
  it("one alert per event; paused users are skipped; 5 per hour cap", async () => {
    const a = await notify(t.pool, { ...base, eventKey: "e1" });
    expect(a.status).toBe("queued");
    if (a.status === "queued") await a.done;
    expect((await notify(t.pool, { ...base, eventKey: "e1" }))).toEqual({ status: "skipped", reason: "duplicate" });
    for (let i = 2; i <= MAX_ALERTS_PER_HOUR; i++) { const r = await notify(t.pool, { ...base, eventKey: `e${i}` }); if (r.status === "queued") await r.done; }
    expect(await notify(t.pool, { ...base, eventKey: "e99" })).toEqual({ status: "skipped", reason: "rate_limited" });
    await t.pool.query("DELETE FROM messages");
    await t.pool.query("UPDATE users SET alerts_paused=true");
    expect(await notify(t.pool, { ...base, eventKey: "e100" })).toEqual({ status: "skipped", reason: "paused" });
  });

  it("failed delivery is marked failed (shown as 'Text not delivered'), after retries", async () => {
    process.env.PHOTON_MOCK_FAIL = "1";
    const r = await notify(t.pool, { ...base, eventKey: "fail1" }, { delays: [1, 1, 1], sleep: async () => {} });
    expect(r.status).toBe("queued");
    if (r.status === "queued") expect(await r.done).toBe("failed");
    expect((await t.pool.query("SELECT status FROM messages")).rows[0].status).toBe("failed");
  });

  it("sendWithRetry: backoff delays 1s/4s/10s are used and the third retry can succeed", async () => {
    const waits: number[] = [];
    let n = 0;
    const sender = { send: async () => { if (++n < 4) throw new Error("x"); return { providerId: "p" }; } };
    const r = await sendWithRetry(sender, "1", "b", undefined, async (ms) => { waits.push(ms); });
    expect(waits).toEqual([1000, 4000, 10000]);
    expect(r.attempts).toBe(4);
  });

  it("unknown user is skipped", async () => {
    expect(await notify(t.pool, { userId: "00000000-0000-4000-8000-0000000000aa", eventKey: "z", body: "x" })).toEqual({ status: "skipped", reason: "no_user" });
  });
});

describe("templates", () => {
  it("exposure and charge alerts match the product spec wording", () => {
    expect(exposureAlert({ fieldTypes: ["card_number"], host: "fastkicks-shop", ageDays: 4 })).toBe("You just entered your card on fastkicks-shop, a site registered 4 days ago. Reply WATCH and I'll check for charges from it.");
    expect(exposureAlert({ fieldTypes: [], host: "x.top", ageDays: null })).toContain("a site I couldn't verify");
    expect(chargeAlert({ amountCents: 4999, descriptor: "FKSHP*LLC", host: "fastkicks-shop", exposureAt: "2026-11-04T15:00:00Z" })).toBe("$49.99 from FKSHP*LLC matches fastkicks-shop, where you entered your card on Nov 4. Reply DISPUTE and I'll draft it.");
    expect(listFields(["card_number", "cvv", "phone"])).toBe("card, card security code and phone number");
  });
});
