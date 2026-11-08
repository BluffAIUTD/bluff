import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { assertProductionConfig, getConfig } from "./config";

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
  /** id of the browser session (signed cookie). */
  sessionId: string;
  /** The user whose data this request reads/writes: every browser session is its own private account (no login). */
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The session id in a signed `bluff_uid` cookie value, or null when it is missing, forged, or not a session id. */
export function sessionFromCookie(signed: string | undefined | null): string | null {
  const v = verifySigned(signed);
  return v && UUID.test(v) ? v.toLowerCase() : null;
}

/** A fresh session: its id and the signed cookie value (for `bluff_uid`). */
export function newSession(): { sessionId: string; value: string } {
  const sessionId = randomUUID();
  return { sessionId, value: signValue(sessionId) };
}

export const sessionCookieHeader = (value: string, c = getConfig()) =>
  `${COOKIE_UID}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${c.isProd ? "; Secure" : ""}`;

/** Each browser session is its own account: the user id is the session id (accounts are created on first use). */
export const userIdForSession = (sessionId: string) => sessionId;

export function getContext(req: Request): RequestContext {
  const c = getConfig();
  assertProductionConfig(c);
  const cookies = parseCookies(req.headers.get("cookie"));
  let sessionId = sessionFromCookie(cookies[COOKIE_UID]);
  let setCookie: string | undefined;
  if (!sessionId) {
    const s = newSession();
    sessionId = s.sessionId;
    setCookie = sessionCookieHeader(s.value, c);
  }
  const headerKey = req.headers.get("x-demo-key");
  const cookieKey = verifySigned(cookies[COOKIE_DEMO]);
  const demoUnlocked = isDemoKeyValid(headerKey, c) || (cookieKey === "demo" && !!c.demoKey);
  return { sessionId, userId: userIdForSession(sessionId), ip: clientIp(req), demoUnlocked, setCookie };
}

/** Apply a context's pending cookie to a response. */
export function withSession<T extends Response>(res: T, ctx: RequestContext): T {
  if (ctx.setCookie) res.headers.append("set-cookie", ctx.setCookie);
  return res;
}
