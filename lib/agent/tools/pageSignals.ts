import fs from "node:fs";
import path from "node:path";
import { getConfig } from "../../config";
import { labelFromHost } from "../../linker/normalize";
import type { PageSignals } from "../../rules/signals";
import { signalsFromParts } from "../../signals/pure";
import { STORES } from "../../../data/stores";
import { str, type ToolDef } from "./types";

/** Extract the same signals the extension computes, from our own storefront HTML (no network). */
export function extractSignalsFromHtml(html: string, host: string, https = true): PageSignals {
  const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "";
  const linkTexts = [...html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => m[1].replace(/<[^>]+>/g, " "));
  return signalsFromParts({
    text, title, linkTexts, https, hostLabel: host,
    hasCardField: /autocomplete=["']cc-number["']|name=["'][^"']*card[^"']*["']/i.test(html),
    hasCountdownAttr: /data-countdown/i.test(html),
  });
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
