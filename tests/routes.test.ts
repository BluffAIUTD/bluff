import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createTestDb } from "./testdb";
import { closePool } from "../lib/db";
import { POST as investigatePage } from "../app/api/investigate/page/route";
import { POST as investigateMessage } from "../app/api/investigate/message/route";
import { GET as getRun } from "../app/api/runs/[runId]/route";
import { GET as streamRun } from "../app/api/runs/[runId]/stream/route";

let t: Awaited<ReturnType<typeof createTestDb>>;
beforeAll(async () => {
  t = await createTestDb("bluff_routes_test", { seed: true });
  process.env.DATABASE_URL = t.url;
  process.env.MOCK_SPEED = "0";
});
afterAll(async () => { await closePool(); await t.drop(); });
beforeEach(() => { process.env.MOCK_SPEED = "0"; });

const post = (url: string, body: unknown, headers: Record<string, string> = {}) =>
  new Request(`http://x${url}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const ctxOf = (runId: string) => ({ params: Promise.resolve({ runId }) });

async function readSse(res: Response) {
  const text = await res.text();
  return text.split("\n\n").filter((b) => b.startsWith("event:")).map((b) => {
    const [ev, data] = b.split("\n");
    return { event: ev.replace("event: ", ""), data: JSON.parse(data.replace("data: ", "")) };
  });
}

describe("investigate + stream", () => {
  it("page run: returns runId, streams steps → verdict → done, persists rows", async () => {
    const r = await investigatePage(post("/api/investigate/page", { url: "fastkicks-shop", host: "fastkicks-shop", fieldTypes: ["card_number"], source: "check" }));
    expect(r.status).toBe(200);
    const { runId } = await r.json();
    const events = await readSse(await streamRun(new Request("http://x/s"), ctxOf(runId)));
    const names = events.map((e) => e.event);
    expect(names.at(-1)).toBe("done");
    expect(names).toContain("verdict");
    expect(names.filter((n) => n === "step").length).toBeGreaterThanOrEqual(4);
    const done = events.at(-1)!.data;
    expect(done.verdictId).toMatch(/^[0-9a-f-]{36}$/);
    const snap = await (await getRun(new Request("http://x/r"), ctxOf(runId))).json();
    expect(snap.run.status).toBe("ok");
    expect(snap.steps.length).toBeGreaterThanOrEqual(4);
    expect(snap.verdict.score).toBe(18);
  });

  it("late subscriber (after completion) still gets the full replay", async () => {
    const { runId } = await (await investigatePage(post("/api/investigate/page", { url: "bayou-bakery", host: "bayou-bakery" }))).json();
    await readSse(await streamRun(new Request("http://x/s"), ctxOf(runId)));
    const again = await readSse(await streamRun(new Request("http://x/s"), ctxOf(runId)));
    expect(again.map((e) => e.event)).toContain("verdict");
    expect(again.at(-1)!.event).toBe("done");
  });

  it("?fail=malformed streams an error with a basic fallback, then done", async () => {
    const { runId } = await (await investigatePage(post("/api/investigate/page?fail=malformed", { url: "fastkicks-shop" }))).json();
    const ev = await readSse(await streamRun(new Request("http://x/s"), ctxOf(runId)));
    const err = ev.find((e) => e.event === "error")!;
    expect(err.data.code).toBe("malformed");
    expect(err.data.fallbackVerdict.mode).toBe("basic");
    expect(ev.at(-1)!.data.mode).toBe("basic");
  });

  it("rejects empty and invalid input with the shared error shape", async () => {
    let r = await investigatePage(post("/api/investigate/page", { url: "   " }));
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("bad_input");
    r = await investigatePage(post("/api/investigate/page", { url: "ftp://x.test/file" }));
    expect(r.status).toBe(400);
    r = await investigateMessage(post("/api/investigate/message", { text: "   " }));
    expect((await r.json()).error.message).toMatch(/Paste/);
    r = await investigateMessage(post("/api/investigate/message", { text: "a".repeat(2001) }));
    expect(r.status).toBe(400);
  });

  it("unknown run → 404; malformed id → 404", async () => {
    expect((await getRun(new Request("http://x/r"), ctxOf("00000000-0000-4000-8000-0000000000aa"))).status).toBe(404);
    expect((await streamRun(new Request("http://x/s"), ctxOf("not-a-uuid"))).status).toBe(404);
  });

  it("message mode runs and eval source is sync but needs the eval key", async () => {
    const msg = "Parcelo: pay $1.99 redelivery fee within 12 hrs: parcelo-redeliver.help/pay";
    let r = await investigateMessage(post("/api/investigate/message", { text: msg, source: "eval" }));
    expect(r.status).toBe(403);
    r = await investigateMessage(post("/api/investigate/message", { text: msg, source: "eval" }, { "x-eval-key": "eval" }));
    const body = await r.json();
    expect(body.verdict.verdict).not.toBe("looks_ok");
    const { runId } = await (await investigateMessage(post("/api/investigate/message", { text: msg }))).json();
    expect((await readSse(await streamRun(new Request("http://x/s"), ctxOf(runId)))).at(-1)!.event).toBe("done");
  });

  it("sets a session cookie on first visit", async () => {
    const r = await investigatePage(post("/api/investigate/page", { url: "tollpay-tx" }));
    expect(r.headers.get("set-cookie")).toContain("bluff_uid=");
  });
});
