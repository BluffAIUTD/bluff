/**
 * product_spec §4 failure-state matrix. Each row names where it is covered. Rows exercised here are the ones that need
 * a database; the rest are covered by the files listed in the comments.
 *
 * Agent verdict (/check, extension): empty input → tests/routes.test.ts; slow >12 s → lib/client/runStream.test.tsx;
 *   malformed/rate-limit/timeout via ?fail= → tests/routes.test.ts + lib/agent/mock.test.ts; low confidence → components/verdict.
 * Charge linker + explanation: SQL link instant + "explanation loading…" → components/charges; agent disagrees → "possible"
 *   → lib/agent/live.test.ts; replay → this file and tests/modes.test.ts.
 * Refund Builder: unlinked disabled → components/charges/refund.test.tsx; slow skeleton → same; template fallback → tests/disputes.test.ts.
 * Bluff Text inbound/outbound: tests/photon.test.ts, tests/exposures.test.ts.
 * Game generation: tests/gamegen.test.ts. RDAP + embeddings: lib/agent/tools/tools.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { MAYA_ID } from "../lib/config";
import { saveReplayTrace, findReplay } from "../lib/agent/cache";
import { resetDemo } from "../scripts/seed/seed";
import { runToCompletion } from "../lib/agent/runs";
import { postScriptedCharge, findScript } from "../lib/demo";
import { VerdictSchema } from "../lib/schemas";
import { loadFixture } from "../lib/agent/mock";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => { t = await createTestDb("bluff_matrix_test", { seed: true }); process.env.DATABASE_URL = t.url; });
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { process.env.MOCK_SPEED = "0"; process.env.AGENT_MODE = "mock"; });

describe("replay traces survive demo reset", () => {
  const live = () => ({ ...VerdictSchema.parse(loadFixture("txn_demo_link_1")!.verdict), mode: "live" as const });
  it("only LIVE verdicts are saved; saved traces are replayed (labeled) after a reset", async () => {
    const steps = [{ kind: "tool" as const, tool: "txn_search", inputSummary: "fkshp", outputSummary: "saved live step", ms: 9 }];
    await saveReplayTrace(t.pool, "txn_demo_link_1", steps, { ...live(), mode: "cached" });
    expect((await t.pool.query("SELECT 1 FROM replay_traces")).rowCount).toBe(0); // fixtures/cached are never stored as "live" traces
    await saveReplayTrace(t.pool, "txn_demo_link_1", steps, live());
    await resetDemo(t.pool);
    const rp = await findReplay(t.pool, MAYA_ID, "00000000-0000-4000-8000-0000000000aa", "txn_demo_link_1");
    expect(rp?.steps[0].outputSummary).toBe("saved live step");
    expect(rp?.verdict.mode).toBe("replayed");
  });

  it("a failed charge run replays the saved live trace instead of the generic fixture", async () => {
    await t.pool.query("INSERT INTO exposures (user_id,url,host,label,score,verdict,user_action,created_at,field_types) VALUES ($1,'u','fastkicks-shop','fastkicks-shop',18,'likely_scam','continue', now() - interval '1 hour','{card_number}')", [MAYA_ID]);
    const posted = await postScriptedCharge(t.pool, MAYA_ID, findScript({ storeSlug: "fastkicks-shop" })!);
    const r = await runToCompletion({ kind: "txn", userId: MAYA_ID, txnId: posted.id }, { fail: "ratelimit" });
    expect(r.mode).toBe("replayed");
    const steps = (await t.pool.query("SELECT output_summary FROM agent_steps WHERE run_id=$1", [r.runId])).rows.map((x) => x.output_summary);
    expect(steps).toContain("saved live step");
  });
});
