import { NextResponse, type NextRequest } from "next/server";
import { STORES } from "./data/stores";

const SLUGS = new Set(STORES.map((s) => s.slug));

/**
 * Dev/single-process hosting of the demo storefront websites: <slug>.<BASE_DOMAIN> (e.g. fastkicks-shop.localhost:3000)
 * is rewritten to /storefront/<slug>/<path>. In production Caddy serves these hosts directly and requests never get here.
 */
export function middleware(req: NextRequest) {
  const host = (req.headers.get("host") ?? "").toLowerCase();
  const base = (process.env.BASE_DOMAIN || "localhost:3000").toLowerCase();
  const m = /^([a-z0-9-]+)\.(.+)$/.exec(host);
  if (!m || (m[2] !== base && m[2] !== base.replace(/:\d+$/, "")) || !SLUGS.has(m[1])) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `/storefront/${m[1]}${req.nextUrl.pathname === "/" ? "/" : req.nextUrl.pathname}`;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
