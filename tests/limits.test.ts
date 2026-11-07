import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { POST as investigatePage } from "../app/api/investigate/page/route";
import { agentBucket, TokenBucket } from "../lib/ratelimit";
import { domainIntel } from "../lib/agent/tools/domainIntel";
import { handleInbound } from "../lib/photon/inbound";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_limits_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { process.env.MOCK_SPEED = "0"; });

describe("rate limiting", () => {
  it("31st agent run from one IP in a minute → 429 with the shared error shape and Retry-After; other IPs unaffected", async () => {
    const post = (ip: string) => investigatePage(new Request("http://x/api/investigate/page", { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ url: "bayou-bakery" }) }));
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await post("9.9.9.9")).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(30);
    const limited = await post("9.9.9.9");
    expect(codes[30]).toBe(429);
    const body = await limited.json();
    expect(body.error.code).toBe("rate_limited");
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await post("8.8.8.8")).status).toBe(200);
    expect(agentBucket).toBeInstanceOf(TokenBucket);
  });
});

describe("SAFE and STOP have lasting effects", () => {
  it("a host marked SAFE by text is allowlisted in later checks", async () => {
    const phone = "+15125551234";
    await t.pool.query("UPDATE users SET phone=$1 WHERE id=$2", [phone, MAYA_ID]);
    const exp = (await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,field_types) VALUES ($1,'u','my-local-shop.example','my-local-shop',30,'likely_scam','continue','{card_number}') RETURNING id", [MAYA_ID])).rows[0].id;
    await t.pool.query("INSERT INTO messages (user_id, phone, direction, body, kind, status, meta) VALUES ($1,$2,'out','alert','alert','sent',$3)", [MAYA_ID, phone, JSON.stringify({ exposure_id: exp })]);
    const ctx = { userId: MAYA_ID, db: t.pool };
    expect((await domainIntel("my-local-shop.example", ctx)).allowlisted).toBe(false);
    await handleInbound(t.pool, { from: phone, text: "SAFE", providerId: "safe-1", hasImage: false });
    expect((await domainIntel("my-local-shop.example", ctx)).allowlisted).toBe(true);
    // allowlist is per user: another user is unaffected
    const other = (await t.pool.query("INSERT INTO users (name) VALUES ('Other') RETURNING id")).rows[0].id;
    expect((await domainIntel("my-local-shop.example", { userId: other, db: t.pool })).allowlisted).toBe(false);
  });
});
