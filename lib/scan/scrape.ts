import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { signalsFromParts } from "../signals/pure";
import type { PageSignals } from "../rules/signals";
import { readStoreHtml } from "../agent/tools/pageSignals";
import { demoStoreFor, normalizeHost } from "./website";

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 4;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 BluffScanner/1.0";

// ---- SSRF guard ---------------------------------------------------------------------------------------------------
/** True for loopback, private, link-local, CGNAT, multicast, reserved and unspecified addresses (v4 and v6). */
export function isBlockedIp(ip: string): boolean {
  const v4 = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (net.isIPv4(v4)) {
    const [a, b] = v4.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const l = ip.toLowerCase();
  return l === "::" || l === "::1" || /^f[cd]/.test(l) || /^fe[89ab]/.test(l) || /^ff/.test(l);
}

/** dns.lookup replacement used by the HTTP agent: the connection can only ever go to a public address. */
function guardedLookup(hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) {
  dns.lookup(hostname, { all: true }, (err, addrs) => {
    if (err) return cb(err, "");
    const ok = addrs.filter((a) => !isBlockedIp(a.address));
    if (!ok.length) return cb(Object.assign(new Error(`blocked non-public address for ${hostname}`), { code: "EBLOCKED" }), "");
    if (options.all) cb(null, ok);
    else cb(null, ok[0].address, ok[0].family);
  });
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: string; url: string };

function decode(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function getOnce(url: URL, signal: AbortSignal): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET", lookup: guardedLookup as never, signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5", "accept-language": "en-US,en;q=0.9", "accept-encoding": "gzip, deflate, br" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) { res.resume(); return resolve({ status, headers: res.headers, body: "", url: url.toString() }); }
      const type = String(res.headers["content-type"] ?? "");
      if (type && !/html|xml|text/i.test(type)) { res.resume(); return resolve({ status, headers: res.headers, body: "", url: url.toString() }); }
      const chunks: Buffer[] = [];
      let size = 0;
      const stream = decode(res);
      stream.on("data", (c: Buffer) => { size += c.length; if (size <= MAX_BYTES) chunks.push(c); else stream.destroy(); });
      const finish = () => resolve({ status, headers: res.headers, body: Buffer.concat(chunks).toString("utf8"), url: url.toString() });
      stream.on("end", finish);
      stream.on("close", finish);
      stream.on("error", () => finish());
    });
    req.on("error", reject);
    req.end();
  });
}

/** GET with manual redirects; every hop goes through the same public-address guard. Only ports 80/443. */
export async function guardedFetch(start: string, signal: AbortSignal): Promise<RawResponse & { hops: string[] }> {
  let url = new URL(start);
  const hops: string[] = [];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error(`refusing ${url.protocol} URL`);
    if (url.port && url.port !== "80" && url.port !== "443") throw new Error("refusing non-standard port");
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, ""))) throw new Error("refusing bare IP address");
    const r = await getOnce(url, signal);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      hops.push(url.toString());
      url = new URL(String(r.headers.location), url);
      continue;
    }
    return { ...r, hops };
  }
  throw new Error("too many redirects");
}

// ---- Extraction ---------------------------------------------------------------------------------------------------
const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export type SiteFacts = {
  title: string; description: string; signals: PageSignals;
  has_privacy_policy: boolean; has_terms: boolean; has_password_field: boolean; has_card_field: boolean;
  mentions_gift_card_or_crypto: boolean; copyright_year: number | null; word_count: number; excerpt: string;
};

/** Facts from raw HTML. Uses the shared signal definition (same as the browser extension) plus a few site-level facts. */
export function factsFromHtml(html: string, host: string, isHttps: boolean): SiteFacts {
  const noScript = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>/gi, " ");
  const text = decodeEntities(noScript.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = decodeEntities(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ?? /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ?? "").trim();
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)];
  const linkTexts = anchors.map((m) => `${decodeEntities(m[2].replace(/<[^>]+>/g, " "))} ${/href=["']([^"']+)["']/i.exec(m[1])?.[1] ?? ""}`);
  const hasCardField = /autocomplete=["']cc-number["']|name=["'][^"']*card[^"']*["']/i.test(html);
  const signals = signalsFromParts({ text, title, linkTexts, https: isHttps, hostLabel: host, hasCardField, hasCountdownAttr: /data-countdown/i.test(html) });
  const years = [...text.matchAll(/(?:©|&copy;|copyright)\s*(?:\d{4}\s*[-–]\s*)?(\d{4})/gi)].map((m) => Number(m[1])).filter((y) => y > 1990 && y < 2100);
  const links = linkTexts.join(" ").toLowerCase();
  return {
    title: clip(title, 90), description: clip(description, 140), signals,
    has_privacy_policy: /privacy/.test(links), has_terms: /terms|conditions/.test(links),
    has_password_field: /type=["']password["']/i.test(html), has_card_field: hasCardField,
    mentions_gift_card_or_crypto: /gift\s?cards?|bitcoin|crypto(currency)?|usdt/i.test(text),
    copyright_year: years.length ? Math.max(...years) : null,
    word_count: text ? text.split(" ").length : 0,
    excerpt: clip(text, 280),
  };
}

export type ScrapeResult =
  | ({ host: string; fetched: true; source: "live" | "demo_store"; final_url: string; final_host: string; status: number; https: boolean;
      redirected_offsite: boolean; bot_blocked: boolean; ms: number } & SiteFacts)
  | { host: string; fetched: false; source: "live"; error: string; ms: number };

const BLOCK_RE = /access denied|just a moment|attention required|are you a robot|captcha|request blocked|pardon our interruption/i;
const registrable = (h: string) => h.split(".").slice(-2).join(".");

/** Scrape a merchant's homepage. `.example` demo stores come from /stores; everything else is a guarded live fetch. */
export async function scrapeSite(rawHost: string): Promise<ScrapeResult> {
  const t0 = Date.now();
  const host = normalizeHost(rawHost);
  if (!/^[a-z0-9.-]+\.[a-z]{2,24}$/.test(host)) return { host, fetched: false, source: "live", error: "not a valid hostname", ms: 0 };

  const slug = demoStoreFor(host);
  if (slug) {
    const html = readStoreHtml(slug);
    if (!html) return { host, fetched: false, source: "live", error: "demo store page missing", ms: Date.now() - t0 };
    return { host, fetched: true, source: "demo_store", final_url: `https://${host}/`, final_host: host, status: 200, https: true, redirected_offsite: false, bot_blocked: false, ms: Date.now() - t0, ...factsFromHtml(html, slug, true) };
  }
  if (host.endsWith(".example") || host.endsWith(".local") || host.endsWith(".internal") || host === "localhost") {
    return { host, fetched: false, source: "live", error: "reserved or internal hostname", ms: 0 };
  }

  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let r: Awaited<ReturnType<typeof guardedFetch>>;
  let isHttps = true;
  try {
    r = await guardedFetch(`https://${host}/`, signal);
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code ?? "";
    if (/CERT|SSL|TLS|ERR_TLS|SELF_SIGNED|EPROTO|ECONNREFUSED/i.test(code) && !signal.aborted) {
      try { r = await guardedFetch(`http://${host}/`, signal); isHttps = false; }
      catch (e2) { return { host, fetched: false, source: "live", error: clip((e2 as Error).message, 90), ms: Date.now() - t0 }; }
    } else {
      const msg = code === "ENOTFOUND" ? "domain does not resolve (DNS)" : signal.aborted ? "timed out after 8 s" : (e as Error).message;
      return { host, fetched: false, source: "live", error: clip(msg, 90), ms: Date.now() - t0 };
    }
  }
  const finalUrl = new URL(r.url);
  const finalHost = normalizeHost(finalUrl.hostname);
  const facts = factsFromHtml(r.body, host, finalUrl.protocol === "https:" && isHttps);
  return {
    host, fetched: true, source: "live", final_url: clip(r.url, 120), final_host: finalHost, status: r.status, https: finalUrl.protocol === "https:",
    redirected_offsite: registrable(finalHost) !== registrable(host),
    bot_blocked: r.status === 403 || r.status === 429 || r.status === 503 || (BLOCK_RE.test(facts.title) && facts.word_count < 400),
    ms: Date.now() - t0, ...facts,
  };
}
