// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { appHosts, autoRuns, computePageSignals, sensitiveFieldTypes, shouldRun, visibleText } from "./src/detect";
import { SseParser } from "./src/sse";
import { Panel } from "./src/panel";
import { extractSignalsFromHtml } from "../lib/agent/tools/pageSignals";
import { STORES } from "../data/stores";

const load = (html: string) => { const d = document.implementation.createHTMLDocument("t"); d.documentElement.innerHTML = html; return d; };
const store = (slug: string) => fs.readFileSync(path.join(process.cwd(), "stores", slug, "index.html"), "utf8");

describe("sensitive field detection", () => {
  it("finds card, cvv and name on the scam storefront; nothing on a plain page", () => {
    const t = sensitiveFieldTypes(load(store("fastkicks-shop")));
    expect(t).toEqual(expect.arrayContaining(["card_number", "cvv"]));
    expect(sensitiveFieldTypes(load("<body><h1>Hello</h1><input name='q' placeholder='Search'><input type='email' name='email'></body>"))).toEqual([]);
  });
  it("by type, autocomplete, name and label text", () => {
    const d = load(`<body>
      <input type="password" name="p"><input autocomplete="tel" name="x"><input autocomplete="bday" name="y">
      <input autocomplete="street-address" name="a"><label for="s">Social Security number</label><input id="s" name="s">
      <input name="ccnumber"><input placeholder="CVC">
      <input name="shipping_email" placeholder="Email address"><input type="hidden" name="card_number"></body>`);
    expect(sensitiveFieldTypes(d).sort()).toEqual(["address", "card_number", "cvv", "dob", "password", "phone", "ssn"]);
  });
  it("email address fields are not treated as street addresses; hidden inputs ignored", () => {
    expect(sensitiveFieldTypes(load("<body><input name='email_address' placeholder='Email address'><input type='hidden' autocomplete='cc-number'></body>"))).toEqual([]);
  });
  it("payment iframes (Stripe Elements etc.) count as card fields without looking inside", () => {
    expect(sensitiveFieldTypes(load('<body><iframe src="https://js.stripe.com/v3/elements-inner"></iframe></body>'))).toEqual(["card_number"]);
    expect(sensitiveFieldTypes(load('<body><iframe title="Secure payment input frame" src="about:blank"></iframe></body>'))).toEqual(["card_number"]);
    expect(sensitiveFieldTypes(load('<body><iframe src="https://example.com/ads"></iframe></body>'))).toEqual([]);
  });
});

describe("PRIVACY: never reads typed values or sends page text", () => {
  it("detection and signals work while every input's .value getter throws", () => {
    const d = load(store("fastkicks-shop"));
    const trap = vi.fn(() => { throw new Error("value was read"); });
    for (const i of Array.from(d.querySelectorAll("input"))) Object.defineProperty(i, "value", { get: trap });
    expect(() => { sensitiveFieldTypes(d); computePageSignals(d, { protocol: "https:", hostname: "x.test" }); visibleText(d); }).not.toThrow();
    expect(trap).not.toHaveBeenCalled();
  });
  it("typed text in inputs/textareas never appears in the visible text", () => {
    const d = load("<body><p>hello</p><input value='4111111111111111'><textarea>secret note</textarea></body>");
    expect(visibleText(d)).not.toMatch(/4111|secret/);
  });
  it("source files never access `.value` (static check)", () => {
    for (const f of fs.readdirSync(path.join(__dirname, "src")).filter((n) => n.endsWith(".ts"))) {
      const code = fs.readFileSync(path.join(__dirname, "src", f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, f).not.toMatch(/\.value\b/);
    }
  });
  it("signals are booleans/numbers only (nothing textual leaves the page)", () => {
    const s = computePageSignals(load(store("fastkicks-shop")), { protocol: "https:", hostname: "fastkicks-shop.example.com" });
    for (const v of Object.values(s)) expect(["boolean", "number"]).toContain(typeof v);
  });
});

describe(`parity: the extension's live-DOM signals equal the server's HTML signals for all ${STORES.length} demo storefronts`, () => {
  it.each(STORES.map((s) => s.slug))("%s", (slug) => {
    const server = extractSignalsFromHtml(store(slug), slug);
    const ext = computePageSignals(load(store(slug)), { protocol: "https:", hostname: slug });
    expect(ext).toEqual(server);
  });
});

describe("shouldRun (idle rules)", () => {
  const o = { safeHosts: ["shop.mine.com"], allowlist: ["amazon.com", "chase.com"], appHost: "bluff.example.com" };
  it("skips the app itself, allowlisted retailers/banks (incl. subdomains) and SAFE hosts", () => {
    expect(shouldRun("bluff.example.com", o)).toBe(false);
    expect(shouldRun("www.amazon.com", o)).toBe(false);
    expect(shouldRun("secure.chase.com", o)).toBe(false);
    expect(shouldRun("shop.mine.com", o)).toBe(false);
    expect(shouldRun("fastkicks-shop.example.com", o)).toBe(true);
    expect(shouldRun("notamazon.com", o)).toBe(true);
  });
  it("app at the apex (bluffai.us): skips only the app and its bluff. alias, never the demo stores on the same domain", () => {
    const apex = { ...o, appHost: "bluffai.us" };
    expect(shouldRun("bluffai.us", apex)).toBe(false);
    expect(shouldRun("www.bluffai.us", apex)).toBe(false);
    expect(shouldRun("bluff.bluffai.us", apex)).toBe(false);
    for (const s of STORES) expect(shouldRun(`${s.slug}.bluffai.us`, apex), s.slug).toBe(true);
    expect(shouldRun("evil-bluffai.us", apex)).toBe(true);
  });
  it("builds against the old bluff.<domain> address also skip the apex; localhost dev skips only localhost", () => {
    expect(appHosts("bluff.bluffai.us").sort()).toEqual(["bluff.bluffai.us", "bluffai.us"]);
    expect(shouldRun("fastkicks-shop.bluffai.us", { ...o, appHost: "bluff.bluffai.us" })).toBe(true);
    expect(shouldRun("localhost", { ...o, appHost: "localhost" })).toBe(false);
    expect(shouldRun("fastkicks-shop.localhost", { ...o, appHost: "localhost" })).toBe(true);
  });
});

describe("autoRuns (checkout only)", () => {
  it("card number, CVV or SSN start a check; password, phone, birthday or address alone do not", () => {
    for (const t of ["card_number", "cvv", "ssn"]) expect(autoRuns([t]), t).toBe(true);
    expect(autoRuns(["password"])).toBe(false);
    expect(autoRuns(["password", "phone", "dob", "address"])).toBe(false);
    expect(autoRuns(["password", "cvv"])).toBe(true);
    expect(autoRuns([])).toBe(false);
  });
});

describe("SseParser", () => {
  it("handles chunk boundaries, comments, CRLF and malformed blocks", () => {
    const p = new SseParser();
    expect(p.push("event: step\ndata: {\"seq\":0")).toEqual([]);
    const ev = p.push("}\n\n: ping\n\nevent: verdict\r\ndata: {\"score\":18}\r\n\r\nevent: x\ndata: {bad\n\n");
    expect(ev).toEqual([{ event: "step", data: { seq: 0 } }, { event: "verdict", data: { score: 18 } }]);
  });
  it("reports heartbeats so the worker can forward them (keep-alive)", () => {
    const onComment = vi.fn();
    const p = new SseParser({ onComment });
    expect(p.push(": ping\n\n: ping\n\nevent: done\ndata: {}\n\n")).toEqual([{ event: "done", data: {} }]);
    expect(onComment).toHaveBeenCalledTimes(2);
    expect(onComment).toHaveBeenCalledWith("ping");
  });
});

describe("Panel", () => {
  const verdict = { score: 18, verdict: "likely_scam", confidence: 0.93, confidence_reason: "agree", evidence: ["a", "b", "c"], next_steps: ["x", "y"], mode: "live" };
  const handlers = () => ({ onLeave: vi.fn(), onContinue: vi.fn(), onSafe: vi.fn(), onClose: vi.fn() });
  const txt = (p: Panel) => p.host.shadowRoot!.textContent ?? "";

  it("renders running, done, logged and error states inside a shadow root", () => {
    const h = handlers(); const p = new Panel(h);
    p.render({ phase: "running", steps: [{ tool: "domain_intel", output: "4 days old" }], host: "x.test" });
    expect(txt(p)).toContain("domain_intel → 4 days old");
    p.render({ phase: "done", verdict, verdictId: "v1", host: "x.test" });
    expect(txt(p)).toContain("18"); expect(txt(p)).toContain("Likely scam"); expect(txt(p)).toContain("LIVE");
    p.render({ phase: "logged", host: "x.test", watch: true, links: [{ label: "See it in your exposure log", href: "http://app/check#exposures", primary: true }] });
    expect(txt(p)).toContain("will watch your charges");
    const a = p.host.shadowRoot!.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("http://app/check#exposures"); expect(a.getAttribute("target")).toBe("_blank");
    p.render({ phase: "error", host: "x.test", message: "boom" });
    expect(txt(p)).toContain("boom");
    expect(document.body.querySelector("[data-bluff-panel]")).toBe(p.host);
    p.close();
  });

  it("buttons call the handlers; continue is disabled until a verdict id exists", () => {
    const h = handlers(); const p = new Panel(h);
    p.render({ phase: "done", verdict, verdictId: null, host: "x.test" });
    const btn = (name: string) => Array.from(p.host.shadowRoot!.querySelectorAll("button")).find((b) => b.textContent === name)!;
    expect(btn("Continue").disabled).toBe(true);
    p.render({ phase: "done", verdict, verdictId: "v1", host: "x.test" });
    btn("Continue and watch my charges").click(); expect(h.onContinue).toHaveBeenCalledWith(true);
    btn("Continue").click(); expect(h.onContinue).toHaveBeenCalledWith(false);
    btn("Leave").click(); btn("Mark this site as safe").click(); btn("✕").click();
    expect(h.onLeave).toHaveBeenCalled(); expect(h.onSafe).toHaveBeenCalled(); expect(h.onClose).toHaveBeenCalled();
    p.close();
  });

  it("page-controlled strings are rendered as text, never as HTML", () => {
    const p = new Panel(handlers());
    p.render({ phase: "done", verdict: { ...verdict, evidence: ["<img src=x onerror=alert(1)>", "b", "c"] }, verdictId: "v", host: "x.test" });
    expect(p.host.shadowRoot!.querySelector("img")).toBeNull();
    expect(txt(p)).toContain("<img src=x onerror=alert(1)>");
    p.close();
  });

  it("shows Nemotron's site summary on AI verdicts, as text", () => {
    const p = new Panel(handlers());
    p.render({ phase: "done", verdict: { ...verdict, analysis: { summary: "Refunds only as <b>store credit</b>." } }, verdictId: "v", host: "x.test" });
    expect(txt(p)).toContain("Refunds only as <b>store credit</b>.");
    expect(p.host.shadowRoot!.querySelector("b")).toBeNull();
    p.render({ phase: "done", verdict: { ...verdict, mode: "basic", analysis: { summary: "hidden on basic" } }, verdictId: "v", host: "x.test" });
    expect(txt(p)).not.toContain("hidden on basic");
    p.close();
  });

  it("low confidence shows Unsure and 'What to check yourself'", () => {
    const p = new Panel(handlers());
    p.render({ phase: "done", verdict: { ...verdict, confidence: 0.3 }, verdictId: "v", host: "x.test" });
    expect(txt(p)).toContain("Unsure"); expect(txt(p)).toContain("What to check yourself");
    p.close();
  });

  it("stalled state: local findings, Try again and Leave; a verdict without an id offers Try again instead of Continue", () => {
    const h = { ...handlers(), onRetry: vi.fn() }; const p = new Panel(h);
    const btn = (name: string) => Array.from(p.host.shadowRoot!.querySelectorAll("button")).find((b) => b.textContent === name);
    p.render({ phase: "stalled", host: "x.test", message: "Bluff couldn't finish checking x.test.", findings: ["Countdown timer pressures you to buy now"] });
    expect(txt(p)).toContain("Basic check of this page (rules only, no AI)");
    expect(txt(p)).toContain("Countdown timer");
    btn("Try again")!.click(); expect(h.onRetry).toHaveBeenCalledTimes(1);
    btn("Leave")!.click(); expect(h.onLeave).toHaveBeenCalled();
    p.render({ phase: "done", verdict: { ...verdict, mode: "basic" }, verdictId: null, host: "x.test", retry: true });
    expect(txt(p)).toContain("BASIC CHECK");
    expect(btn("Continue")).toBeUndefined();
    btn("Try again")!.click(); expect(h.onRetry).toHaveBeenCalledTimes(2);
    p.close();
  });
});
