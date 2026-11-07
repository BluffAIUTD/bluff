import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { assertProductionConfig, getConfig, MAYA_ID } from "./config";

export const COOKIE_UID = "bluff_uid";
export const COOKIE_DEMO = "bluff_demo";

function sign(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function signValue(value: string, secret = getConfig().sessionSecret) {
  return `${value}.${sign(value, secret)}`;
}

export function verifySigned(signed: string | undefined | null, secret = getConfig().sessionSecret): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i <= 0) return null;
  const value = signed.slice(0, i);
  const given = Buffer.from(signed.slice(i + 1));
  const want = Buffer.from(sign(value, secret));
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;
  return value;
}

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export type RequestContext = {
  /** id of the browser session (signed cookie); only a label, data belongs to `userId`. */
  sessionId: string;
  /** The user whose data this request reads/writes. Shared demo user "Maya" when DEMO_MODE. */
  userId: string;
  ip: string;
  demoUnlocked: boolean;
  /** Set-Cookie value when a new session cookie must be issued. */
  setCookie?: string;
};

export function clientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "local";
}

export function isDemoKeyValid(provided: string | null | undefined, c = getConfig()): boolean {
  return !!provided && !!c.demoKey && provided === c.demoKey;
}

export function getContext(req: Request): RequestContext {
  const c = getConfig();
  assertProductionConfig(c);
  const cookies = parseCookies(req.headers.get("cookie"));
  let sessionId = verifySigned(cookies[COOKIE_UID]);
  let setCookie: string | undefined;
  if (!sessionId) {
    sessionId = randomUUID();
    setCookie = `${COOKIE_UID}=${encodeURIComponent(signValue(sessionId))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${c.isProd ? "; Secure" : ""}`;
  }
  const headerKey = req.headers.get("x-demo-key");
  const cookieKey = verifySigned(cookies[COOKIE_DEMO]);
  const demoUnlocked = isDemoKeyValid(headerKey, c) || (cookieKey === "demo" && !!c.demoKey);
  return { sessionId, userId: MAYA_ID, ip: clientIp(req), demoUnlocked, setCookie };
}

/** Apply a context's pending cookie to a response. */
export function withSession<T extends Response>(res: T, ctx: RequestContext): T {
  if (ctx.setCookie) res.headers.append("set-cookie", ctx.setCookie);
  return res;
}
