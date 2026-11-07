import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as createDisputeRoute } from "../app/api/disputes/route";
import { PATCH as patchDispute } from "../app/api/disputes/[id]/route";
import { GET as getTxn } from "../app/api/transactions/[id]/route";
import { createDispute, templateNarrative, buildLetter, buildTimeline, NEXT_STEPS, type DisputeFacts } from "../lib/disputes";
import { postScriptedCharge, findScript } from "../lib/demo";
import { draftDisputeTool } from "../lib/agent/tools/draftDispute";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_disputes_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.PHOTON_MODE = "mock"; process.env.AGENT_MODE = "mock";
  for (const tbl of ["disputes", "messages", "exposures"]) await t.pool.query(`DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM transactions WHERE user_id=$1 AND script_id IS NOT NULL", [MAYA_ID]);
});

const req = (body?: unknown, method = "POST") => new Request("http://x/api/disputes", { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
const idp = (id: string) => ({ params: Promise.resolve({ id }) });

async function linkedCharge(slug = "fastkicks-shop", score = 18) {
  const exp = (await t.pool.query(
    "INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,field_types,created_at) VALUES ($1,$2,$3,$4,$5,$6,'continue','{card_number}', now() - interval '1 hour') RETURNING id, created_at",
    [MAYA_ID, `https://${slug}`, slug, slug, score, score < 40 ? "likely_scam" : "looks_ok"],
  )).rows[0];
  const posted = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: slug })!);
  return { expId: exp.id as string, txnId: posted.id };
}

describe("dispute packet", () => {
  it("drafts a letter, timeline and next steps from real data; nothing is sent", async () => {
    const { expId, txnId } = await linkedCharge();
    await t.pool.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, meta) VALUES ($1,'p','out','alert','alert','sent',$2)", [MAYA_ID, JSON.stringify({ exposure_id: expId })]);
    const before = Number((await t.pool.query("SELECT count(*) n FROM messages")).rows[0].n);
    const res = await createDisputeRoute(req({ txnId }));
    expect(res.status).toBe(201);
    const { dispute } = await res.json();
    expect(dispute).toMatchObject({ status: "draft", generatedBy: "template", exposureId: expId, txnId });
    expect(dispute.letter).toContain("Cardholder: Maya");
    expect(dispute.letter).toContain("Card: ending in [last 4 digits of your card]");
    expect(dispute.letter).toContain("Amount: $49.99");
    expect(dispute.letter).toContain("Merchant (as on statement): FKSHP*LLC");
    expect(dispute.letter).toContain("Reason: Suspected fraudulent online store");
    expect(dispute.letter).toContain("[Edit before sending");
    expect(dispute.timeline.map((x: { kind: string }) => x.kind)).toEqual(["exposure", "alert", "charge"]);
    const times = dispute.timeline.map((x: { at: string }) => Date.parse(x.at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(dispute.nextSteps).toEqual(NEXT_STEPS);
    expect(Number((await t.pool.query("SELECT count(*) n FROM messages")).rows[0].n)).toBe(before); // no automatic send
  });

  it("is idempotent; regenerate makes a new draft; detail endpoint returns the dispute", async () => {
    const { txnId } = await linkedCharge();
    const a = (await (await createDisputeRoute(req({ txnId }))).json()).dispute;
    const again = await createDisputeRoute(req({ txnId }));
    expect(again.status).toBe(200);
    expect((await again.json()).dispute.id).toBe(a.id);
    const regen = await createDisputeRoute(req({ txnId, regenerate: true }));
    expect(regen.status).toBe(201);
    const d = await (await getTxn(new Request("http://x"), idp(txnId))).json();
    expect(d.dispute).not.toBeNull();
  });

  it("refuses unlinked charges and expected (legit) charges with a clear conflict", async () => {
    const lone = (await t.pool.query("SELECT id FROM transactions WHERE user_id=$1 LIMIT 1", [MAYA_ID])).rows[0].id;
    let r = await createDisputeRoute(req({ txnId: lone }));
    expect(r.status).toBe(409);
    expect((await r.json()).error.message).toMatch(/isn't linked/);
    const { txnId } = await linkedCharge("bayou-bakery", 92);
    r = await createDisputeRoute(req({ txnId }));
    expect(r.status).toBe(409);
    r = await createDisputeRoute(req({ txnId: "00000000-0000-4000-8000-0000000000aa" }));
    expect(r.status).toBe(404);
  });

  it("'Mark as filed' only changes status; unknown ids 404; other values rejected", async () => {
    const { txnId } = await linkedCharge();
    const { dispute } = await (await createDisputeRoute(req({ txnId }))).json();
    const r = await patchDispute(req({ status: "filed" }, "PATCH"), idp(dispute.id));
    expect((await r.json()).dispute.status).toBe("filed");
    expect((await patchDispute(req({ status: "draft" }, "PATCH"), idp(dispute.id))).status).toBe(400);
    expect((await patchDispute(req({ status: "filed" }, "PATCH"), idp("00000000-0000-4000-8000-0000000000aa"))).status).toBe(404);
  });

  it("draft_dispute agent tool drafts through the same path", async () => {
    const { txnId } = await linkedCharge();
    const out = (await draftDisputeTool.run({ txn_id: txnId }, { userId: MAYA_ID, db: t.pool })) as { dispute_id: string; generated_by: string };
    expect(out.generated_by).toBe("template");
    expect(out.dispute_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("AI narrative with template fallback", () => {
  let server: http.Server; let reply: { status: number; body: unknown } = { status: 200, body: {} };
  beforeAll(async () => {
    server = http.createServer((rq, rs) => { rq.resume(); rq.on("end", () => { rs.writeHead(reply.status, { "content-type": "application/json" }); rs.end(JSON.stringify(reply.body)); }); });
    await new Promise<void>((r) => server.listen(0, r));
    process.env.NVIDIA_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
    process.env.NVIDIA_API_KEY = "k"; process.env.NEMOTRON_MODEL = "m";
  });
  afterAll(() => { server.close(); });

  it("uses the model prose when valid (generated_by=ai); falls back to the template on error or junk", async () => {
    process.env.AGENT_MODE = "live";
    const prose = "On the date shown I entered my card details on this website, and a charge from a similar merchant name appeared days later. I do not recognize it and want it reviewed.";
    reply = { status: 200, body: { choices: [{ message: { content: prose } }] } };
    const a = await linkedCharge();
    const ai = await createDispute(t.pool, MAYA_ID, a.txnId);
    expect(ai.dispute.generatedBy).toBe("ai");
    expect(ai.dispute.letter).toContain(prose);

    reply = { status: 500, body: {} };
    const fb = await createDispute(t.pool, MAYA_ID, a.txnId, { regenerate: true });
    expect(fb.dispute.generatedBy).toBe("template");
    expect(fb.dispute.letter).toContain("I entered my card on fastkicks-shop");

    reply = { status: 200, body: { choices: [{ message: { content: "ok" } }] } };
    expect((await createDispute(t.pool, MAYA_ID, a.txnId, { regenerate: true })).dispute.generatedBy).toBe("template");
  });
});

describe("pure builders", () => {
  const f: DisputeFacts = { name: "Maya", descriptor: "FKSHP*LLC", amountCents: 4999, chargedAt: new Date("2026-11-07T15:00:00Z"), category: "fake_store", host: "fastkicks-shop", exposedAt: new Date("2026-11-04T15:00:00Z"), fieldTypes: ["card_number", "cvv"], siteScore: 18, siteAgeDays: 4, matchReasons: ["descriptor 'FKSHP' abbreviates 'fastkicks-shop'"], now: new Date("2026-11-08T12:00:00Z") };
  it("narrative and letter contain only known facts and Chicago-local dates", () => {
    const n = templateNarrative(f);
    expect(n).toContain("November 4, 2026");
    expect(n).toContain("registered 4 days earlier");
    expect(buildLetter(f, n)).toContain("Date: November 8, 2026");
    expect(buildTimeline({ ...f, alertAt: null }).map((x) => x.kind)).toEqual(["exposure", "charge"]);
  });
  it("unknown site age is handled", () => {
    expect(templateNarrative({ ...f, siteAgeDays: null })).toContain("a website that Bluff rated 18/100");
  });
});
