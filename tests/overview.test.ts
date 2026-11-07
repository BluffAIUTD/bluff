import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestDb } from "./testdb";
import { MAYA_ID } from "../lib/config";
import { loadOverview } from "../lib/overview";

let t: Awaited<ReturnType<typeof createTestDb>>;
const NOW = new Date("2026-11-07T18:00:00Z");
beforeAll(async () => { t = await createTestDb("bluff_overview_test", { seed: true, now: NOW }); });
afterAll(async () => { await t.drop(); });

describe("overview", () => {
  it("seeded state: card test and duplicate pair need attention (≤ 14 days), no exposures", async () => {
    const o = await loadOverview(t.pool, MAYA_ID, NOW);
    expect(o.exposuresThisWeek).toBe(0);
    expect(o.latestExposures).toEqual([]);
    expect(o.needsAttention.some((x) => x.flags.includes("card_test"))).toBe(true);
    expect(o.needsAttention.every((x) => Date.parse(x.ts) >= NOW.getTime() - 14 * 86_400_000)).toBe(true);
  });
  it("counts this week's exposures and returns only the latest 3 and 5 alerts", async () => {
    for (let i = 0; i < 4; i++) await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at) VALUES ($1,'u',$2,$2,20,'likely_scam','continue',$3)", [MAYA_ID, `site${i}`, new Date(NOW.getTime() - i * 86_400_000)]);
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at) VALUES ($1,'u','old','old',20,'likely_scam','continue',$2)", [MAYA_ID, new Date(NOW.getTime() - 20 * 86_400_000)]);
    for (let i = 0; i < 7; i++) await t.pool.query("INSERT INTO messages (user_id,phone,direction,body,kind,status) VALUES ($1,'p','out',$2,'alert','sent')", [MAYA_ID, `m${i}`]);
    const o = await loadOverview(t.pool, MAYA_ID, NOW);
    expect(o.exposuresThisWeek).toBe(4);
    expect(o.latestExposures).toHaveLength(3);
    expect(o.alerts).toHaveLength(5);
  });
});
