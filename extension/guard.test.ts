// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createGuard, dismissKey, STALL_MS, type GuardEnv } from "./src/guard";
import { demoStoreSlug, loggedLinks, originOnly, storeUrl } from "./src/links";
import { basicFindings } from "./src/basic";
import { renderPopup } from "./src/popupView";

const APP = "https://bluffai.us";
const CARD_FORM = `<form><label for="cc">Card number</label><input id="cc" autocomplete="cc-number"><input name="cvv" placeholder="CVV"></form>`;
const LOGIN_FORM = `<form><input type="email" name="email"><input type="password" name="password"></form>`;
const verdict = { score: 18, verdict: "likely_scam", confidence: 0.9, confidence_reason: "agree", evidence: ["a", "b", "c"], next_steps: ["x"], mode: "live" };
const basic = { ...verdict, score: 22, mode: "basic" };

type Msg = Parameters<GuardEnv["send"]>[0];

function setup(opts: { html?: string; host?: string; replies?: Partial<Record<string, unknown>> } = {}) {
  document.body.innerHTML = opts.html ?? CARD_FORM;
  const host = opts.host ?? "shop.example";
  const session = new Map<string, string>();
  const replies: Record<string, unknown> = { investigate: { ok: true, runId: "11111111-1111-4111-8111-111111111111" }, expose: { ok: true }, snapshot: { ok: false }, ...opts.replies };
  const send = vi.fn(async (m: Msg) => replies[m.type]);
  const env: GuardEnv = {
    doc: document,
    // A real tab is deep in a checkout, with personal data in the query and hash. None of it may leave the page.
    loc: Object.assign({ origin: `https://${host}`, hostname: host, protocol: "https:" }, { href: `https://${host}/checkout/step-2?email=maya%40example.com&order=991#card` }),
    app: APP,
    send,
    saveSafeHost: vi.fn(async () => {}),
    session: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => void session.set(k, v) },
    goBack: vi.fn(),
  };
  const guard = createGuard(env);
  const sent = (type: string) => send.mock.calls.map((c) => c[0]).filter((m) => m.type === type);
  return { guard, env, send, sent, session };
}

const panel = () => document.querySelector("[data-bluff-panel]") as HTMLElement | null;
const chip = () => document.querySelector("[data-bluff-chip]") as HTMLElement | null;
const text = () => panel()?.shadowRoot?.textContent ?? "";
const button = (name: string) => Array.from(panel()?.shadowRoot?.querySelectorAll("button") ?? []).find((b) => b.textContent === name);
const flush = () => new Promise((r) => setTimeout(r, 0));
const ev = (attempt: number, event: string, data: unknown) => ({ type: "bluff:event", attempt, event: { event, data } });

beforeEach(() => { document.body.innerHTML = ""; });
afterEach(() => { vi.useRealTimers(); document.querySelectorAll("[data-bluff-panel],[data-bluff-chip]").forEach((e) => e.remove()); });

describe("Checkout Guard: what it sends", () => {
  it("sends only the page's origin as the url, never the path, query or hash", async () => {
    const { guard, sent } = setup();
    guard.check(); await flush();
    const [inv] = sent("investigate");
    expect(inv.payload).toMatchObject({ url: "https://shop.example/", host: "shop.example" });
    expect(inv.payload!.fieldTypes).toEqual(expect.arrayContaining(["card_number", "cvv"]));
    expect(JSON.stringify(inv)).not.toMatch(/checkout|step-2|maya|order|#card/);
    for (const v of Object.values(inv.payload!.signals as object)) expect(["boolean", "number"]).toContain(typeof v);
  });
  it("logs the exposure with the origin only, too", async () => {
    const { guard, sent } = setup();
    guard.check(); await flush();
    guard.onEvent(ev(1, "verdict", verdict)); guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    button("Continue and watch my charges")!.click(); await flush();
    const [exp] = sent("expose");
    expect(exp.payload).toMatchObject({ verdictId: "v1", url: "https://shop.example/", host: "shop.example", action: "watch" });
    expect(JSON.stringify(exp)).not.toMatch(/checkout|maya/);
  });
});

describe("Checkout Guard: when it runs", () => {
  it("card/CVV fields start a check automatically", async () => {
    const { guard, sent } = setup();
    guard.check(); await flush();
    expect(sent("investigate")).toHaveLength(1);
    expect(text()).toContain("Checking shop.example");
    guard.check(); await flush();
    expect(sent("investigate")).toHaveLength(1); // once per page
  });
  it("a login form only shows the chip, and nothing is sent until it is clicked", async () => {
    const { guard, sent, send } = setup({ html: LOGIN_FORM, host: "github.com" });
    guard.check(); guard.check(); await flush();
    expect(send).not.toHaveBeenCalled();
    expect(panel()).toBeNull();
    expect(document.querySelectorAll("[data-bluff-chip]")).toHaveLength(1);
    expect(chip()!.shadowRoot!.textContent).toContain("Check this site with Bluff");
    (chip()!.shadowRoot!.querySelector("button") as HTMLButtonElement).click(); await flush();
    expect(sent("investigate")).toHaveLength(1);
    expect(sent("investigate")[0].payload!.fieldTypes).toEqual(["password"]);
    expect(chip()).toBeNull();
    expect(panel()).not.toBeNull();
  });
  it("hiding the chip sends nothing, but a card field that appears later still starts a check", async () => {
    const { guard, send, sent } = setup({ html: LOGIN_FORM });
    guard.check();
    (chip()!.shadowRoot!.querySelector('button[aria-label^="Hide"]') as HTMLButtonElement).click();
    guard.check();
    expect(chip()).toBeNull(); expect(send).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML("beforeend", CARD_FORM);
    guard.check(); await flush();
    expect(sent("investigate")).toHaveLength(1);
  });
  it("a page with no sensitive fields does nothing", () => {
    const { guard, send } = setup({ html: "<input name='q' placeholder='Search'>" });
    guard.check();
    expect(send).not.toHaveBeenCalled(); expect(panel()).toBeNull(); expect(chip()).toBeNull();
  });
});

describe("Checkout Guard: panel lifecycle", () => {
  it("a closed panel stays closed while the stream keeps sending, and stays off for the tab session", async () => {
    const { guard, session } = setup();
    guard.check(); await flush();
    guard.onEvent(ev(1, "step", { tool: "crawl", outputSummary: "3 pages" }));
    button("✕")!.click();
    expect(panel()).toBeNull();
    guard.onEvent(ev(1, "step", { tool: "nemotron", outputSummary: "reading" }));
    guard.onEvent(ev(1, "verdict", verdict));
    guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    expect(panel()).toBeNull();
    expect(guard.dismissed).toBe(true);
    expect(session.get(dismissKey("shop.example"))).toBe("1");
  });
  it("Mark as safe saves the host locally and closes for good", async () => {
    const { guard, env } = setup();
    guard.check(); await flush();
    guard.onEvent(ev(1, "verdict", verdict));
    button("Mark this site as safe")!.click(); await flush();
    expect(env.saveSafeHost).toHaveBeenCalledWith("shop.example");
    guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    expect(panel()).toBeNull();
  });
  it("error with the server's basic check, then done: shows that verdict, labeled, and Continue works", async () => {
    const { guard, sent } = setup();
    guard.check(); await flush();
    guard.onEvent(ev(1, "error", { code: "timeout", message: "The AI check took too long.", fallbackVerdict: basic }));
    expect(text()).toContain("22"); expect(text()).toContain("BASIC CHECK");
    expect(button("Continue")!.disabled).toBe(true);
    guard.onEvent(ev(1, "done", { verdictId: "v9", mode: "basic" }));
    expect(text()).toContain("22");
    expect(text()).toContain("The AI check took too long. This is Bluff's basic check (rules only).");
    expect(button("Continue")!.disabled).toBe(false);
    button("Continue")!.click(); await flush();
    expect(sent("expose")[0].payload).toMatchObject({ verdictId: "v9", action: "continue" });
  });
  it("an error without a fallback (stream lost) shows local findings and Try again, which starts a new attempt", async () => {
    const { guard, sent } = setup({ html: `${CARD_FORM}<p>Ends in 09:59</p>` });
    guard.check(); await flush();
    guard.onEvent(ev(1, "error", { code: "upstream_down", message: "The check stopped before it finished" }));
    expect(text()).toContain("The check stopped before it finished");
    expect(text()).toContain("Countdown timer pressures you to buy now");
    button("Try again")!.click(); await flush();
    expect(sent("investigate").map((m) => m.attempt)).toEqual([1, 2]);
    guard.onEvent(ev(1, "verdict", { ...verdict, score: 99 })); // stale event from the first attempt
    expect(text()).toContain("Checking shop.example");
    guard.onEvent(ev(2, "verdict", verdict)); guard.onEvent(ev(2, "done", { verdictId: "v2" }));
    expect(text()).toContain("18"); expect(button("Continue and watch my charges")!.disabled).toBe(false);
  });
  it("the background failing to start the check stalls right away", async () => {
    const { guard } = setup({ replies: { investigate: { ok: false, message: "Too many checks. Try again in a minute." } } });
    guard.check(); await flush();
    expect(text()).toContain("Too many checks"); expect(button("Try again")).toBeDefined();
  });
});

describe("Checkout Guard: timeout", () => {
  it(`after ${STALL_MS / 1000} s without a finished check it asks the server for the saved run and shows it`, async () => {
    vi.useFakeTimers();
    const { guard, sent } = setup({ replies: { snapshot: { ok: true, snapshot: { run: { verdictId: "v7" }, verdict: basic } } } });
    guard.check(); await vi.advanceTimersByTimeAsync(0);
    guard.onEvent(ev(1, "step", { tool: "crawl", outputSummary: "3 pages" }));
    await vi.advanceTimersByTimeAsync(STALL_MS - 1000);
    expect(sent("snapshot")).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent("snapshot")[0].payload).toEqual({ runId: "11111111-1111-4111-8111-111111111111" });
    expect(text()).toContain("22"); expect(text()).toContain("basic check");
    expect(button("Continue")!.disabled).toBe(false);
  });
  it("falls back to the basic findings and Try again when the server has nothing either", async () => {
    vi.useFakeTimers();
    const { guard, sent } = setup();
    guard.check(); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(STALL_MS);
    expect(text()).toContain("Bluff couldn't finish checking shop.example.");
    expect(text()).toContain("Basic check of this page");
    guard.onEvent(ev(1, "verdict", verdict)); // too late: this attempt is over
    expect(text()).toContain("Bluff couldn't finish");
    button("Try again")!.click(); await vi.advanceTimersByTimeAsync(0);
    expect(sent("investigate")).toHaveLength(2);
  });
  it("a finished check clears the timer", async () => {
    vi.useFakeTimers();
    const { guard, sent } = setup();
    guard.check(); await vi.advanceTimersByTimeAsync(0);
    guard.onEvent(ev(1, "verdict", verdict)); guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    await vi.advanceTimersByTimeAsync(STALL_MS * 2);
    expect(sent("snapshot")).toHaveLength(0);
    expect(text()).toContain("18");
  });
});

describe("after Continue: where the panel points", () => {
  it("demo store → make the purchase on the test card; any other site → the exposure log", async () => {
    expect(loggedLinks(APP, "fastkicks-shop.bluffai.us").links.map((l) => l.href)).toEqual([`${APP}/scan?push=fastkicks-shop`, `${APP}/check#exposures`]);
    expect(loggedLinks(APP, "fastkicks-shop.bluffai.us").note).toMatch(/simulated/i);
    expect(loggedLinks(APP, "shop.example").links.map((l) => l.href)).toEqual([`${APP}/check#exposures`]);
    const { guard } = setup({ host: "fastkicks-shop.bluffai.us" });
    guard.check(); await flush();
    guard.onEvent(ev(1, "verdict", verdict)); guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    button("Continue and watch my charges")!.click(); await flush();
    expect(text()).toContain("will watch your charges");
    const links = Array.from(panel()!.shadowRoot!.querySelectorAll("a"));
    expect(links.map((a) => a.textContent)).toEqual(["Make this purchase on the test card", "See it in your exposure log"]);
    expect(links[0].getAttribute("href")).toBe("https://bluffai.us/scan?push=fastkicks-shop");
  });
  it("a failed log shows the server's message", async () => {
    const { guard } = setup({ replies: { expose: { ok: false, message: "Unknown verdict. Run a check first." } } });
    guard.check(); await flush();
    guard.onEvent(ev(1, "verdict", verdict)); guard.onEvent(ev(1, "done", { verdictId: "v1" }));
    button("Continue")!.click(); await flush();
    expect(text()).toContain("Unknown verdict");
  });
});

describe("links and local basic check", () => {
  it("origin only, store URLs like lib/config storeOrigin(), demo store detection", () => {
    expect(originOnly("https://shop.example:8443/a/b?c=d#e")).toBe("https://shop.example:8443/");
    expect(storeUrl("https://bluffai.us", "bayou-bakery")).toBe("https://bayou-bakery.bluffai.us");
    expect(storeUrl("https://bluff.bluffai.us", "bayou-bakery")).toBe("https://bayou-bakery.bluffai.us");
    expect(storeUrl("http://localhost:3000", "fastkicks-shop")).toBe("http://fastkicks-shop.localhost:3000");
    expect(demoStoreSlug("fastkicks-shop.bluffai.us", "https://bluffai.us")).toBe("fastkicks-shop");
    expect(demoStoreSlug("fastkicks-shop.localhost", "http://localhost:3000")).toBe("fastkicks-shop");
    expect(demoStoreSlug("fastkicks-shop.evil.com", "https://bluffai.us")).toBeNull();
    expect(demoStoreSlug("not-a-store.bluffai.us", "https://bluffai.us")).toBeNull();
  });
  it("basic findings list only warning signs, and say so when there are none", () => {
    expect(basicFindings({ countdown_timer: true, no_refund_policy: true, https: true }, "x.com")).toEqual(["Countdown timer pressures you to buy now", "No refund or returns policy"]);
    expect(basicFindings({ https: true, no_contact_page: false }, "x.com")[0]).toMatch(/No warning signs on this page itself/);
  });
});

describe("toolbar popup", () => {
  it("shows status, demo-store links for this deployment and the safe-sites list with remove buttons", () => {
    const root = document.createElement("main"); document.body.append(root);
    const onRemove = vi.fn();
    renderPopup(root, { app: APP, version: "1.1.0", safeHosts: ["shop.mine.com", "<b>x</b>.com"], onRemove });
    expect(root.textContent).toContain("Bluff Checkout Guard is on");
    const hrefs = Array.from(root.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([APP, "https://fastkicks-shop.bluffai.us", "https://bayou-bakery.bluffai.us"]);
    expect(root.querySelector("b")).toBeNull(); // hosts are text, never HTML
    (root.querySelector('button[aria-label="Remove shop.mine.com from safe sites"]') as HTMLButtonElement).click();
    expect(onRemove).toHaveBeenCalledWith("shop.mine.com");
    expect(root.textContent).toContain("Version 1.1.0 · checks with bluffai.us");
    renderPopup(root, { app: APP, version: "1.1.0", safeHosts: [], onRemove });
    expect(root.textContent).toContain("None yet");
  });
});
