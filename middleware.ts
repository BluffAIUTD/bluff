import { NextResponse, type NextRequest } from "next/server";
import { STORES } from "./data/stores";
import { COOKIE_UID, newSession, sessionCookieHeader, sessionFromCookie } from "./lib/session";

const SLUGS = new Set(STORES.map((s) => s.slug));

/**
 * 1. Dev/single-process hosting of the demo storefront websites: <slug>.<BASE_DOMAIN> (e.g. fastkicks-shop.localhost:3000)
 *    is rewritten to /storefront/<slug>/<path>. In production Caddy serves these hosts directly and requests never get here.
 * 2. Every other request gets a signed session cookie if it has none, so the visitor's private account exists from their
 *    first page view. The new cookie is also added to the forwarded request, so the page rendering now already sees it.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const base = (process.env.BASE_DOMAIN || "localhost:3000").toLowerCase();
  const m = /^([a-z0-9-]+)\.(.+)$/.exec(host);
  if (m && (m[2] === base || m[2] === base.replace(/:\d+$/, "")) && SLUGS.has(m[1])) {
    const url = req.nextUrl.clone();
    url.pathname = `/storefront/${m[1]}${req.nextUrl.pathname === "/" ? "/" : req.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  if (sessionFromCookie(req.cookies.get(COOKIE_UID)?.value)) return NextResponse.next();
  const s = newSession();
  const others = (req.headers.get("cookie") ?? "").split(";").map((p) => p.trim()).filter((p) => p && !p.startsWith(`${COOKIE_UID}=`));
  const headers = new Headers(req.headers);
  headers.set("cookie", [...others, `${COOKIE_UID}=${encodeURIComponent(s.value)}`].join("; "));
  const res = NextResponse.next({ request: { headers } });
  res.headers.append("set-cookie", sessionCookieHeader(s.value));
  return res;
}

// Node.js runtime: the session cookie is signed with node:crypto and SESSION_SECRET is read at request time.
export const config = { matcher: ["/((?!_next/|favicon.ico).*)"], runtime: "nodejs" };
