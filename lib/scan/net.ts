import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import zlib from "node:zlib";
import type { Readable } from "node:stream";
import { loopbackAllowedFor } from "./stores";

export const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 BluffScanner/1.0";
const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 4;

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

/**
 * dns.lookup replacement: the socket can only ever connect to a public address (checked at connect time, so DNS
 * rebinding between check and use is not possible). `allowLoopback` is the one exception: our own demo storefronts in dev.
 */
export function guardedLookup(allowLoopback: boolean) {
  return (hostname: string, options: dns.LookupOptions, cb: (err: NodeJS.ErrnoException | null, address: string | dns.LookupAddress[], family?: number) => void) => {
    dns.lookup(hostname, { all: true }, (err, addrs) => {
      if (err) return cb(err, "");
      const ok = addrs.filter((a) => !isBlockedIp(a.address) || (allowLoopback && (a.address === "127.0.0.1" || a.address === "::1")));
      if (!ok.length) return cb(Object.assign(new Error(`blocked non-public address for ${hostname}`), { code: "EBLOCKED" }), "");
      if (options.all) cb(null, ok);
      else cb(null, ok[0].address, ok[0].family);
    });
  };
}

export type Fetched = { status: number; headers: http.IncomingHttpHeaders; body: string; url: string; hops: string[] };
export type Fetcher = (url: string, signal: AbortSignal) => Promise<Fetched>;

function decode(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(zlib.createGunzip());
  if (enc === "deflate") return res.pipe(zlib.createInflate());
  if (enc === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

function getOnce(url: URL, signal: AbortSignal, allowLoopback: boolean): Promise<Omit<Fetched, "hops">> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.request(url, {
      method: "GET", lookup: guardedLookup(allowLoopback) as never, signal,
      headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5", "accept-language": "en-US,en;q=0.9", "accept-encoding": "gzip, deflate, br" },
    }, (res) => {
      const status = res.statusCode ?? 0;
      const done = (body: string) => resolve({ status, headers: res.headers, body, url: url.toString() });
      if (status >= 300 && status < 400) { res.resume(); return done(""); }
      const type = String(res.headers["content-type"] ?? "");
      if (type && !/html|xml|text|json/i.test(type)) { res.resume(); return done(""); }
      const chunks: Buffer[] = [];
      let size = 0, finished = false;
      const stream = decode(res);
      const finish = () => { if (finished) return; finished = true; done(Buffer.concat(chunks).toString("utf8")); };
      stream.on("data", (c: Buffer) => { size += c.length; if (size <= MAX_BYTES) chunks.push(c); else stream.destroy(); });
      stream.on("end", finish);
      stream.on("close", finish);
      stream.on("error", finish);
    });
    req.on("error", reject);
    req.end();
  });
}

/** GET with manual redirects; every hop is re-validated (scheme, port, bare IPs, public address at connect time). */
export const guardedFetch: Fetcher = async (start, signal) => {
  let url = new URL(start);
  const hops: string[] = [];
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    if (!/^https?:$/.test(url.protocol)) throw new Error(`refusing ${url.protocol} URL`);
    const allowLoopback = loopbackAllowedFor(url.hostname, url.port);
    if (url.port && url.port !== "80" && url.port !== "443" && !allowLoopback) throw new Error("refusing non-standard port");
    if (net.isIP(url.hostname.replace(/^\[|\]$/g, ""))) throw new Error("refusing bare IP address");
    const r = await getOnce(url, signal, allowLoopback);
    if (r.status >= 300 && r.status < 400 && r.headers.location) {
      hops.push(url.toString());
      url = new URL(String(r.headers.location), url);
      continue;
    }
    return { ...r, hops };
  }
  throw new Error("too many redirects");
};
