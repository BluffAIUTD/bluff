import dns from "node:dns/promises";
import net from "node:net";
import { isBlockedIp } from "./net";

/**
 * Headless-browser fallback for pages that build their content with JavaScript. Only used when a page's server HTML
 * has too little readable text. Talks to a browserless/chromium container (RENDER_URL, e.g. http://render:3000) over
 * its /content endpoint, which loads the page in Chromium, runs its scripts and returns the finished HTML.
 *
 * Safety: the target host must resolve to public addresses only (same rule as the plain crawler), requests from inside
 * the browser to private/link-local/loopback ranges are rejected by pattern, and the container's own network egress to
 * those ranges is dropped at the host firewall (see DEPLOY.md). No forms are submitted; images, media and fonts are skipped.
 * Off unless RENDER_URL is set; any failure simply means "use the plain HTML".
 */
export type Rendered = { html: string; ms: number };

/** Regexes (browserless rejectRequestPattern) for URLs that point at non-public places. */
export const PRIVATE_URL_PATTERNS = [
  "^https?://(localhost|[^/]*\\.localhost|[^/]*\\.internal|[^/]*\\.local)(:\\d+)?(/|$)",
  "^https?://(0|10|127)\\.",
  "^https?://169\\.254\\.",
  "^https?://192\\.168\\.",
  "^https?://172\\.(1[6-9]|2\\d|3[01])\\.",
  "^https?://100\\.(6[4-9]|[7-9]\\d|1[01]\\d|12[0-7])\\.",
  "^https?://\\[",
  "^(file|ftp|chrome|about|data|blob|ws|wss):",
];

export function renderConfig() {
  const url = process.env.RENDER_URL?.trim().replace(/\/+$/, "") || "";
  return {
    url,
    token: process.env.RENDER_TOKEN?.trim() || "",
    enabled: !!url && process.env.RENDER_ENABLED !== "0",
    /** Pages rendered per site at most. */
    maxPages: Number(process.env.RENDER_MAX_PAGES ?? 3),
    timeoutMs: Number(process.env.RENDER_TIMEOUT_MS ?? 9000),
  };
}

/** True when every address `host` resolves to is public. */
export async function resolvesPublic(host: string): Promise<boolean> {
  const h = host.replace(/^\[|\]$/g, "").replace(/:\d+$/, "");
  if (net.isIP(h)) return false;
  try {
    const addrs = await dns.lookup(h, { all: true });
    return addrs.length > 0 && addrs.every((a) => !isBlockedIp(a.address));
  } catch {
    return false;
  }
}

/** Render `url` in headless Chromium. Returns null when rendering is off, the host isn't public, or anything fails. */
export async function renderPage(url: string, signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<Rendered | null> {
  const c = renderConfig();
  if (!c.enabled) return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || (u.port && u.port !== "80" && u.port !== "443")) return null;
  if (!(await resolvesPublic(u.hostname))) return null;
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(c.timeoutMs + 3000);
  try {
    const r = await fetchImpl(`${c.url}/content${c.token ? `?token=${encodeURIComponent(c.token)}` : ""}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      body: JSON.stringify({
        url: u.toString(),
        gotoOptions: { waitUntil: "networkidle2", timeout: c.timeoutMs },
        bestAttempt: true,
        rejectResourceTypes: ["image", "media", "font"],
        rejectRequestPattern: PRIVATE_URL_PATTERNS,
      }),
    });
    if (!r.ok) return null;
    const html = await r.text();
    return html.length > 200 ? { html: html.slice(0, 1_500_000), ms: Date.now() - t0 } : null;
  } catch {
    return null;
  }
}
