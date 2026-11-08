import { NextResponse } from "next/server";
import { COOKIE_DEMO, isDemoKeyValid, signValue } from "@/lib/session";
import { getConfig } from "@/lib/config";

/** Presenter visits /demo?key=... once; the unlocked state is held in a signed cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!isDemoKeyValid(url.searchParams.get("key"))) {
    return NextResponse.json({ error: { code: "forbidden", message: "Invalid demo key" } }, { status: 403 });
  }
  const res = NextResponse.redirect(new URL("/scan?demo=1", url.origin));
  res.headers.append(
    "set-cookie",
    `${COOKIE_DEMO}=${encodeURIComponent(signValue("demo"))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=86400${getConfig().isProd ? "; Secure" : ""}`,
  );
  return res;
}
