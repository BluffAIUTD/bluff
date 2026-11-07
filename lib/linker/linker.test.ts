import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "../../tests/testdb";
import { MAYA_ID } from "../config";
import { findCandidates, linkTransaction } from "./index";
import { listTransactionsWithFlags, getTransactionWithFlags } from "../rules/flags";
import { normalizeDescriptor } from "./normalize";

const NOW = new Date("2026-11-07T18:00:00Z");
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
let t: Awaited<ReturnType<typeof createTestDb>>;

beforeAll(async () => { t = await createTestDb("bluff_linker_test", { seed: true, now: NOW }); });
afterAll(async () => { await t.drop(); });

const addExposure = async (label: string, at: Date, score = 18, watch = false) =>
  (await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,watch,created_at,field_types) VALUES ($1,$2,$3,$4,$5,$6,'continue',$7,$8,'{card_number}') RETURNING id",
    [MAYA_ID, `https://${label}.example`, `${label}.example`, label, score, score < 40 ? "likely_scam" : "looks_ok", watch, at])).rows[0].id as string;
const addTxn = async (descriptor: string, ts: Date, cents: number, extra: { recurring?: boolean } = {}) =>
  (await t.pool.query("INSERT INTO transactions (ts,user_id,descriptor,descriptor_norm,amount_cents,is_recurring) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id",
    [ts, MAYA_ID, descriptor, normalizeDescriptor(descriptor), cents, !!extra.recurring])).rows[0].id as string;

describe("linker", () => {
  it("links FKSHP*LLC to the fastkicks-shop exposure, fast, with reasons", async () => {
    const exp = await addExposure("fastkicks-shop", day(-3));
    const txn = await addTxn("FKSHP*LLC", NOW, 4999);
    await linkTransaction(t.pool, MAYA_ID, txn); // warm
    const r = (await linkTransaction(t.pool, MAYA_ID, txn))!;
    expect(r.best?.exposureId).toBe(exp);
    expect(r.best?.kind).toBe("flagged");
    expect(r.best?.reasons.join(" ")).toContain("charged 3 days after exposure");
    expect(r.ms).toBeLessThan(100);
    const f = (await getTransactionWithFlags(t.pool, MAYA_ID, txn))!;
    expect(f.flags).toContain("exposure_link");
    expect(f.link?.exposureId).toBe(exp);
  });

  it("never links a charge that happened before the exposure", async () => {
    const r = await findCandidates(t.pool, MAYA_ID, { ts: day(-10), descriptor: "FKSHP*LLC" });
    expect(r.best).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it("ignores exposures older than 45 days", async () => {
    const r = await findCandidates(t.pool, MAYA_ID, { ts: day(60), descriptor: "FKSHP*LLC" });
    expect(r.best).toBeNull();
  });

  it("reports '1 other possible match' when two exposures match", async () => {
    await addExposure("fastkicks-shop", day(-2)); // same site visited twice
    const r = await findCandidates(t.pool, MAYA_ID, { ts: NOW, descriptor: "FKSHP*LLC" });
    expect(r.best).not.toBeNull();
    expect(r.otherCount).toBeGreaterThanOrEqual(1);
  });

  it("watch adds priority", async () => {
    const a = await addExposure("giftcard-zone", day(-30), 20, false);
    const before = (await findCandidates(t.pool, MAYA_ID, { ts: NOW, descriptor: "GIFTCARD ZONE" })).candidates.find((c) => c.exposureId === a)!;
    await t.pool.query("UPDATE exposures SET watch=true WHERE id=$1", [a]);
    const after = (await findCandidates(t.pool, MAYA_ID, { ts: NOW, descriptor: "GIFTCARD ZONE" })).candidates.find((c) => c.exposureId === a)!;
    expect(after.matchScore).toBeGreaterThan(before.matchScore);
  });

  it("legit exposure + legit charge is an 'expected charge', not flagged", async () => {
    await addExposure("bayou-bakery", day(-1), 90);
    const txn = await addTxn("SQ *BAYOU BAKERY", NOW, 1250);
    const f = (await getTransactionWithFlags(t.pool, MAYA_ID, txn))!;
    expect(f.flags).toContain("expected_charge");
    expect(f.flags).not.toContain("exposure_link");
    expect(f.link?.kind).toBe("expected");
  });

  it("a charge with no candidate has no link", async () => {
    const txn = await addTxn("TOTALLY UNRELATED MERCHANT", NOW, 2000);
    const f = (await getTransactionWithFlags(t.pool, MAYA_ID, txn))!;
    expect(f.link).toBeNull();
    expect(f.flags).not.toContain("exposure_link");
  });
});

describe("rule flags", () => {
  it("flags the seeded duplicate pair and card test", async () => {
    const all = await listTransactionsWithFlags(t.pool, MAYA_ID, 200);
    expect(all.filter((x) => x.flags.includes("duplicate")).length).toBeGreaterThanOrEqual(2);
    const test = all.find((x) => x.descriptor === "TST* QWKPAY")!;
    expect(test.flags).toContain("card_test");
  });

  it("price drift: 2x the usual streaming price", async () => {
    const id = await addTxn("STREAMBOX.COM", NOW, 3198, { recurring: true });
    const f = (await getTransactionWithFlags(t.pool, MAYA_ID, id))!;
    expect(f.flags).toContain("price_drift");
    const normal = await addTxn("STREAMBOX.COM", day(1), 1599, { recurring: true });
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, normal))!.flags).not.toContain("price_drift");
  });

  it("price drift needs ≥ 2 prior charges", async () => {
    await addTxn("ONEOFF SHOP", day(-5), 1000);
    const id = await addTxn("ONEOFF SHOP", NOW, 9000);
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, id))!.flags).not.toContain("price_drift");
  });

  it("new subscription: a $0–$1 trial then a real charge, or recurring with no history", async () => {
    await addTxn("TRIALFLIX", day(-1), 100);
    const real = await addTxn("TRIALFLIX", NOW, 1999);
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, real))!.flags).toContain("new_subscription");
    const rec = await addTxn("BRANDNEW SUB", NOW, 999, { recurring: true });
    expect((await getTransactionWithFlags(t.pool, MAYA_ID, rec))!.flags).toContain("new_subscription");
  });

  it("empty user yields no transactions; unknown id yields null", async () => {
    expect(await listTransactionsWithFlags(t.pool, "00000000-0000-4000-8000-0000000000ff", 10)).toEqual([]);
    expect(await getTransactionWithFlags(t.pool, MAYA_ID, "00000000-0000-4000-8000-0000000000aa")).toBeNull();
    expect(await linkTransaction(t.pool, MAYA_ID, "00000000-0000-4000-8000-0000000000aa")).toBeNull();
  });
});
