import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createTestDb, sessionCookie } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as createDisputeRoute } from "../app/api/disputes/route";
import { PATCH as patchDispute } from "../app/api/disputes/[id]/route";
import { GET as getTxn } from "../app/api/transactions/[id]/route";
import { createDispute, disputeContext, templateNarrative, buildLetter, buildTimeline, NEXT_STEPS, type DisputeFacts } from "../lib/disputes";
import { postScriptedCharge, findScript } from "../lib/demo";
import { draftDisputeTool } from "../lib/agent/tools/draftDispute";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_disputes_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(async () => {
  process.env.AGENT_MODE = "mock";
  for (const tbl of ["disputes", "messages", "exposures"]) await t.pool.query(`DELETE FROM ${tbl}`);
  await t.pool.query("DELETE FROM transactions WHERE user_id=$1 AND script_id IS NOT NULL", [MAYA_ID]);
});

const req = (body?: unknown, method = "POST") => new Request("http://x/api/disputes", { method, headers: { "content-type": "application/json", ...sessionCookie() }, body: body ? JSON.stringify(body) : undefined });
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
    const d = await (await getTxn(new Request("http://x", { headers: sessionCookie() }), idp(txnId))).json();
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

describe("dispute from bank-scan evidence (site check, no exposure)", () => {
  const VOLT = "voltdeals-outlet.localhost:3000";
  let ext = 0;
  async function scanCharge(o: { score?: number; verdict?: string; deep?: boolean; basicOnly?: boolean } = {}) {
    const txnId = (await t.pool.query(
      "INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,source,external_id,merchant_name,website) VALUES (now() - interval '2 days',$1,'VOLTDEALS OUTLET','voltdeals outlet',18900,'nessie',$2,'VoltDeals Outlet',$3) RETURNING id",
      [MAYA_ID, `disptest_${++ext}`, VOLT],
    )).rows[0].id as string;
    const score = o.score ?? 12, label = o.verdict ?? "likely_scam";
    await t.pool.query("INSERT INTO site_scans (user_id, host, merchant, crawl, intel, basic, created_at) VALUES ($1,$2,'VoltDeals Outlet',$3,'{}',$4, now() - interval '1 hour')", [MAYA_ID, VOLT,
      JSON.stringify({ origin: `http://${VOLT}` }),
      JSON.stringify({ score: o.basicOnly ? score : 30, label: o.basicOnly ? label : "likely_scam", confidence: 0.74, category: "fake_store", findings: [
        { id: "domain_new", severity: "high", title: "Domain registered 21 days ago", detail: "Registered 2026-10-17.", page: undefined },
        { id: "history_claim", severity: "medium", title: "Claims to operate since 2016", detail: "But the domain was registered in 2026.", page: "/about" },
        { id: "https_ok", severity: "good", title: "Valid HTTPS certificate", detail: "" },
      ] })]);
    if (!o.basicOnly) {
      const payload = { score, verdict: label, confidence: 0.82, confidence_reason: "x", category: "fake_store", evidence: ["Domain registered 21 days ago", "Claims to operate since 2016", "Suite 0 address"], evidence_keys: [], next_steps: ["a", "b"], linked: {}, mode: "live",
        analysis: { summary: "s", findings: [{ title: "Address is 'Suite 0'", detail: "No such suite.", severity: "high", page: "/contact" }, { title: "Claims to operate since 2016", detail: "Domain is 21 days old.", severity: "medium", page: `http://${VOLT}/about` }, { title: "Has a privacy policy", detail: "", severity: "good" }] } };
      await t.pool.query("INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,'site',$2,$3,'live')", [MAYA_ID, VOLT, JSON.stringify(payload)]);
    }
    return txnId;
  }
  beforeEach(async () => {
    await t.pool.query("DELETE FROM transactions WHERE external_id LIKE 'disptest_%'");
    await t.pool.query("DELETE FROM verdicts WHERE subject_type='site'");
    await t.pool.query("DELETE FROM site_scans");
    await t.pool.query("DELETE FROM allowlist WHERE user_id IS NOT NULL");
  });

  it("a likely-scam site verdict is enough: letter cites the site check, timeline lists the check (with page URLs) and the charge", async () => {
    const txnId = await scanCharge();
    expect(await disputeContext(t.pool, MAYA_ID, txnId)).toMatchObject({ basis: "site", site: { host: VOLT, score: 12, label: "likely_scam", mode: "live" } });
    const res = await createDisputeRoute(req({ txnId }));
    expect(res.status).toBe(201);
    const { dispute } = await res.json();
    expect(dispute).toMatchObject({ exposureId: null, txnId, status: "draft", generatedBy: "template" });
    expect(dispute.letter).toContain("Amount: $189.00");
    expect(dispute.letter).toContain("Reason: Suspected fraudulent online store");
    expect(dispute.letter).toContain(`reviewed the merchant's website (${VOLT}) and rated it 12/100 (likely scam), citing: Address is 'Suite 0'; Claims to operate since 2016`);
    expect(dispute.letter).not.toMatch(/I entered my/);
    expect(dispute.timeline.map((x: { kind: string }) => x.kind)).toEqual(["charge", "site_check"]);
    const check = dispute.timeline[1];
    expect(check.label).toBe(`Bluff checked ${VOLT}: 12/100, likely scam`);
    expect(check.detail).toMatch(/^Nemotron deep review, 82% sure\. Address is 'Suite 0'; Claims to operate since 2016\.$/);
    expect(check.sources).toEqual([`http://${VOLT}/contact`, `http://${VOLT}/about`]);
  });

  it("basic check only (no AI review) still counts, labeled as such; the scan alert shows in the timeline", async () => {
    const txnId = await scanCharge({ basicOnly: true, score: 24 });
    await t.pool.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, meta) VALUES ($1,'p','out','alert','alert','delivered',$2)", [MAYA_ID, JSON.stringify({ source: "scan", txn_id: "x", txn_ids: [txnId] })]);
    const { dispute } = await (await createDisputeRoute(req({ txnId }))).json();
    expect(dispute.timeline.map((x: { kind: string }) => x.kind)).toEqual(["charge", "site_check", "alert"]);
    expect(dispute.timeline[1].detail).toMatch(/^Basic check \(rules only, no AI\), 74% sure\. Domain registered 21 days ago; Claims to operate since 2016\.$/);
    expect(dispute.timeline[1].sources).toEqual([`http://${VOLT}/about`]);
  });

  it("unsure below 50 counts; unsure 60, looks OK and a site marked SAFE don't (server and page agree)", async () => {
    let txnId = await scanCharge({ score: 45, verdict: "unsure" });
    expect((await createDisputeRoute(req({ txnId }))).status).toBe(201);
    await t.pool.query("DELETE FROM verdicts WHERE subject_type='site'"); await t.pool.query("DELETE FROM site_scans");
    for (const [score, verdict] of [[60, "unsure"], [85, "looks_ok"]] as const) {
      txnId = await scanCharge({ score, verdict });
      expect((await disputeContext(t.pool, MAYA_ID, txnId))!.basis).toBeNull();
      expect((await createDisputeRoute(req({ txnId }))).status).toBe(409);
      await t.pool.query("DELETE FROM verdicts WHERE subject_type='site'"); await t.pool.query("DELETE FROM site_scans");
    }
    txnId = await scanCharge();
    await t.pool.query("INSERT INTO allowlist (host, user_id) VALUES ($1,$2)", [VOLT, MAYA_ID]);
    expect(await disputeContext(t.pool, MAYA_ID, txnId)).toMatchObject({ basis: null, site: { allowlisted: true } });
    expect((await createDisputeRoute(req({ txnId }))).status).toBe(409);
  });

  it("an exposure-linked charge keeps its exposure basis and wording", async () => {
    const { txnId } = await linkedCharge();
    expect((await disputeContext(t.pool, MAYA_ID, txnId))!.basis).toBe("exposure");
    const { dispute } = await (await createDisputeRoute(req({ txnId }))).json();
    expect(dispute.timeline.map((x: { kind: string }) => x.kind)).toEqual(["exposure", "charge"]);
    expect(dispute.letter).toContain("I entered my card on fastkicks-shop");
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
