import dns from "node:dns/promises";
import { STORES } from "../../data/stores";

/** A hostname-ish token with an alphabetic TLD: "walmart.com", "fastkicks-shop.example". */
const HOST_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24})\b/gi;
const NOT_TLD = new Set(["llc", "inc", "corp", "ltd", "co"]);

export const normalizeHost = (h: string) => h.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[/:?#].*$/, "").replace(/^www\./, "").replace(/\.$/, "");

/** Pull the merchant's website out of a statement line or merchant name, if one is written there. */
export function websiteFromText(text: string): string | null {
  for (const m of text.matchAll(HOST_RE)) {
    const host = normalizeHost(m[1]);
    const tld = host.split(".").pop() ?? "";
    if (!NOT_TLD.has(tld) && host.length <= 253) return host;
  }
  return null;
}

/** Demo storefronts live on the reserved .example TLD and are served from /stores, never fetched from the internet. */
export function demoStoreFor(host: string): string | null {
  const h = normalizeHost(host);
  if (!h.endsWith(".example")) return null;
  const label = h.slice(0, -".example".length).split(".").pop() ?? "";
  return STORES.some((s) => s.slug === label) ? label : null;
}

export type ResolvedSite = { host: string | null; how: "statement" | "merchant_name" | "guessed" | "none"; tried: string[] };

/**
 * Find the merchant's website: the domain on the statement line, else one in the merchant name, else a guess from
 * the merchant name (`whataburger` → whataburger.com) that is kept only if it resolves in DNS.
 */
export async function resolveWebsite(opts: { merchant?: string | null; descriptor?: string | null; website?: string | null }, lookup = (h: string) => dns.lookup(h)): Promise<ResolvedSite> {
  if (opts.website) return { host: normalizeHost(opts.website), how: "statement", tried: [] };
  const fromDesc = websiteFromText(opts.descriptor ?? "");
  if (fromDesc) return { host: fromDesc, how: "statement", tried: [] };
  const fromName = websiteFromText(opts.merchant ?? "");
  if (fromName) return { host: fromName, how: "merchant_name", tried: [] };
  const base = (opts.merchant || opts.descriptor || "")
    .replace(/^\s*(?:SQ|SP|TST|PAYPAL|PP)\s*\*\s*/i, "").replace(/\b(llc|inc|co|corp|ltd|store|#?\d+)\b/gi, " ").toLowerCase();
  const words = base.split(/[^a-z0-9]+/).filter(Boolean).slice(0, 3);
  const tried = [...new Set([words.join(""), words.join("-"), words[0]].filter((w) => w && w.length >= 3).map((w) => `${w}.com`))];
  for (const host of tried) {
    try { await lookup(host); return { host, how: "guessed", tried }; } catch { /* next */ }
  }
  return { host: null, how: "none", tried };
}
