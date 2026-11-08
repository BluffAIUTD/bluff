import { describe, it, expect, afterEach } from "vitest";
import { signValue, verifySigned, getContext, parseCookies, COOKIE_UID, COOKIE_DEMO } from "./session";
import { TokenBucket } from "./ratelimit";
import { MAYA_ID, assertProductionConfig, getConfig } from "./config";

const req = (headers: Record<string, string> = {}) => new Request("http://x/api", { headers });

afterEach(() => { delete process.env.DEMO_KEY; delete (process.env as Record<string, string>).NODE_ENV; delete process.env.SESSION_SECRET; });

describe("signed cookies", () => {
  it("round-trips and rejects tampering", () => {
    const s = signValue("abc", "k");
    expect(verifySigned(s, "k")).toBe("abc");
    expect(verifySigned(s.replace("abc", "abd"), "k")).toBeNull();
    expect(verifySigned(s, "other")).toBeNull();
    expect(verifySigned("nodot", "k")).toBeNull();
    expect(verifySigned(undefined)).toBeNull();
  });
  it("issues a new cookie when missing or forged", () => {
    expect(getContext(req()).setCookie).toContain(COOKIE_UID);
    expect(getContext(req({ cookie: `${COOKIE_UID}=forged.sig` })).setCookie).toBeTruthy();
  });
  it("keeps a valid cookie; each session is its own account", () => {
    const sid = "11111111-1111-4111-8111-111111111111";
    const ctx = getContext(req({ cookie: `${COOKIE_UID}=${encodeURIComponent(signValue(sid))}` }));
    expect(ctx.setCookie).toBeUndefined();
    expect(ctx.sessionId).toBe(sid);
    expect(ctx.userId).toBe(sid);
    const fresh = getContext(req());
    expect(fresh.userId).toBe(fresh.sessionId);
    expect(fresh.userId).not.toBe(MAYA_ID);
    expect(getContext(req()).userId).not.toBe(fresh.userId);
  });
  it("rejects a signed value that is not a session id (e.g. the demo cookie's value)", () => {
    const ctx = getContext(req({ cookie: `${COOKIE_UID}=${encodeURIComponent(signValue("demo"))}` }));
    expect(ctx.setCookie).toContain(COOKIE_UID);
    expect(ctx.userId).toMatch(/^[0-9a-f-]{36}$/);
  });
  it("parses cookies", () => { expect(parseCookies("a=1; b=x%20y")).toEqual({ a: "1", b: "x y" }); });
});

describe("demo gate", () => {
  it("unlocks via header or signed cookie, not by query", () => {
    process.env.DEMO_KEY = "k1";
    expect(getContext(req()).demoUnlocked).toBe(false);
    expect(getContext(req({ "x-demo-key": "bad" })).demoUnlocked).toBe(false);
    expect(getContext(req({ "x-demo-key": "k1" })).demoUnlocked).toBe(true);
    expect(getContext(req({ cookie: `${COOKIE_DEMO}=${encodeURIComponent(signValue("demo"))}` })).demoUnlocked).toBe(true);
    expect(getContext(new Request("http://x/api?demo=1")).demoUnlocked).toBe(false);
  });
});

describe("production guard", () => {
  it("refuses default secret in production", () => {
    (process.env as Record<string, string>).NODE_ENV = "production";
    expect(() => assertProductionConfig(getConfig())).toThrow();
    process.env.SESSION_SECRET = "a-real-secret";
    expect(() => assertProductionConfig(getConfig())).not.toThrow();
  });
});

describe("TokenBucket", () => {
  it("limits and refills", () => {
    let t = 0;
    const b = new TokenBucket(3, 3 / 60_000, () => t);
    expect([1, 2, 3, 4].map(() => b.take("ip").ok)).toEqual([true, true, true, false]);
    t += 20_000; // 1 token back
    expect(b.take("ip").ok).toBe(true);
    expect(b.take("ip").ok).toBe(false);
    expect(b.take("other").ok).toBe(true);
  });
});
