import { describe, it, expect, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadFixture, mockRun, paceFor } from "./mock";
import { STORES } from "../../data/stores";
import { VerdictSchema, type RunStreamEvent } from "../schemas";
import type { RunInput } from "./types";

beforeEach(() => { process.env.MOCK_SPEED = "0"; });

const page = (host: string): RunInput => ({ kind: "page", userId: "u", url: `https://${host}`, host, fieldTypes: ["card_number"], signals: {}, source: "check" });
const collect = async (i: RunInput, fail?: "timeout" | "malformed" | "ratelimit") => {
  const ev: RunStreamEvent[] = [];
  const r = await mockRun(i, (e) => ev.push(e), { fail });
  return { ev, r };
};

describe("fixtures", () => {
  it("one valid fixture per storefront plus the signature charge", () => {
    for (const s of STORES) {
      const f = loadFixture(s.slug)!;
      expect(f, s.slug).not.toBeNull();
      expect(VerdictSchema.safeParse(f.verdict).success).toBe(true);
      expect(f.verdict.verdict === "likely_scam").toBe(s.scam);
      expect(f.steps.length).toBeGreaterThanOrEqual(3);
    }
    expect(loadFixture("txn_demo_link_1")!.verdict.linked.txn_id).toBe("txn_demo_link_1");
    expect(fs.readdirSync(path.join(process.cwd(), "fixtures/runs")).length).toBe(STORES.length + 1);
  });
  it("rejects path-traversal keys", () => { expect(loadFixture("../package")).toBeNull(); expect(loadFixture("a/b")).toBeNull(); });
});

describe("mock run", () => {
  it("fastkicks-shop streams ordered steps then verdict then done, labeled cached", async () => {
    const { ev, r } = await collect(page("fastkicks-shop"));
    const types = ev.map((e) => e.type);
    expect(types.slice(-2)).toEqual(["verdict", "done"]);
    expect(types.filter((t) => t === "step").length).toBeGreaterThanOrEqual(4);
    const seqs = ev.filter((e) => e.type === "step").map((e) => (e as Extract<RunStreamEvent, { type: "step" }>).data.seq);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
    expect(r.verdict.score).toBe(18);
    expect(r.mode).toBe("cached"); // a fixture is never presented as live
  });
  it("unknown host falls back to a basic-labeled rules verdict", async () => {
    const { r } = await collect(page("example-unknown.test"));
    expect(r.mode).toBe("basic");
    expect(VerdictSchema.safeParse(r.verdict).success).toBe(true);
  });
  it("message mode returns a basic verdict for a scam text", async () => {
    const { r } = await collect({ kind: "message", userId: "u", text: "Parcelo: pay $1.99 redelivery fee within 12 hrs: parcelo-redeliver.help/pay", source: "check" });
    expect(r.verdict.verdict).not.toBe("looks_ok");
  });
  it.each([["timeout", "timeout"], ["malformed", "malformed"], ["ratelimit", "rate_limited"]] as const)("?fail=%s emits an error with a basic fallback", async (f, code) => {
    const { ev, r } = await collect(page("fastkicks-shop"), f);
    const err = ev.find((e) => e.type === "error") as Extract<RunStreamEvent, { type: "error" }>;
    expect(err.data.code).toBe(code);
    expect(err.data.fallbackVerdict?.mode).toBe("basic");
    expect(r.mode).toBe("basic");
    expect(ev.at(-1)?.type).toBe("done");
  });
  it("pacing: first step 400 ms, later 600–1400 ms at speed 1", () => {
    expect(paceFor(0, 1)).toBe(400);
    for (let i = 1; i < 10; i++) { expect(paceFor(i, 1)).toBeGreaterThanOrEqual(600); expect(paceFor(i, 1)).toBeLessThan(1400); }
    expect(paceFor(3, 0)).toBe(0);
  });
});
