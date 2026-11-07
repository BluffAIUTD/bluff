import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../../config";
import { labelFromHost } from "../../linker/normalize";
import type { PageSignals } from "../../rules/signals";
import { STORES } from "../../../data/stores";
import { str, type ToolDef } from "./types";

const BRAND_WORDS = ["nike", "adidas", "usps", "fedex", "e-zpass", "ezpass", "amazon", "paypal", "apple"];

/** Extract the same signals the extension computes, from our own storefront HTML (no network). */
export function extractSignalsFromHtml(html: string, host: string, https = true): PageSignals {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").toLowerCase();
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").toLowerCase();
  const links = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => m[1].replace(/<[^>]+>/g, " ").toLowerCase());
  const hostLabel = host.toLowerCase();
  const discount = /(\d{2,3})\s?%\s*off/.exec(text);
  return {
    has_card_field: /autocomplete=["']cc-number["']|name=["'][^"']*card[^"']*["']/i.test(html),
    gift_card_or_crypto_only: /(gift\s?cards?|crypto(currency)?)\s*(or\s*\w+\s*)?only|only\s+(accepts?\s+)?(gift\s?cards?|crypto)/.test(text),
    countdown_timer: /data-countdown|(ends|expires)\s+in\s+\d{1,2}:\d{2}/.test(html.toLowerCase()),
    scarcity_banner: /only\s+\d+\s+left|almost gone|selling fast/.test(text),
    no_contact_page: !links.some((l) => /contact|about|support/.test(l)),
    no_refund_policy: !/refund|returns?\s+(policy|accepted)|money[- ]back/.test(text),
    brand_words_in_title: BRAND_WORDS.some((b) => title.includes(b) && !hostLabel.includes(b)),
    https,
    ...(discount ? { discount_pct: Number(discount[1]) } : {}),
  };
}

export function storesDir() { return process.env.STORES_DIR || path.join(process.cwd(), "stores"); }

/** Resolve a hostname to a known demo storefront slug, or null. Only these are ever read (no arbitrary fetches → no SSRF). */
export function demoSlugFor(host: string, baseDomain = getConfig().baseDomain): string | null {
  const label = labelFromHost(host, baseDomain);
  return STORES.some((s) => s.slug === label) ? label : null;
}

export function readStoreHtml(slug: string): string | null {
  if (!STORES.some((s) => s.slug === slug)) return null;
  const file = path.join(storesDir(), slug, "index.html");
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

export async function pageSignals(host: string, provided?: PageSignals): Promise<{ signals: PageSignals; source: "extension" | "storefront" | "none"; analyzed: boolean; note?: string }> {
  if (provided && Object.keys(provided).length) return { signals: provided, source: "extension", analyzed: true };
  const slug = demoSlugFor(host);
  const html = slug ? readStoreHtml(slug) : null;
  if (slug && html) return { signals: extractSignalsFromHtml(html, slug), source: "storefront", analyzed: true };
  return { signals: {}, source: "none", analyzed: false, note: "limited check: page not analyzed" };
}

export const pageSignalsTool: ToolDef = {
  name: "page_signals",
  description: "Get on-page scam signals (gift-card-only, countdown timer, missing contact page, ...). Extension-provided signals are normalized; for our own demo stores the page is analyzed server-side. Unknown hosts return a limited check.",
  parameters: { type: "object", properties: { host: { type: "string" }, signals: { type: "object" } }, required: ["host"] },
  run: async (args) => pageSignals(str(args.host, 255), (args.signals as PageSignals | undefined) ?? undefined),
};
