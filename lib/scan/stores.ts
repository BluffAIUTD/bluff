import { SITE_SLUGS, STORES } from "../../data/stores";

/**
 * Our own demo storefront websites live at <slug>.<BASE_DOMAIN>: "fastkicks-shop.localhost:3000" in dev (served by
 * middleware.ts), "fastkicks-shop.example.com" in production (served by Caddy). Bank statements in Nessie name them
 * with the deployment-independent pseudo-domain "<slug>.demo", which the sync maps to the live host.
 */
const base = () => (process.env.BASE_DOMAIN || "localhost:3000").toLowerCase();
const baseHost = () => base().replace(/:\d+$/, "");
const basePort = () => /:(\d+)$/.exec(base())?.[1] ?? "";
const isLocal = () => /^(localhost|127\.0\.0\.1)$/.test(baseHost());

export const DEMO_PSEUDO_TLD = "demo";

/** "fastkicks-shop.demo" → "fastkicks-shop.localhost:3000" (or the production host). Other hosts unchanged. */
export function mapDemoHost(host: string): string {
  const m = /^([a-z0-9-]+)\.demo$/i.exec(host.trim());
  return m && STORES.some((s) => s.slug === m[1].toLowerCase()) ? `${m[1].toLowerCase()}.${base()}` : host;
}

/** Slug when `host` (optionally with :port) is one of our storefront sites on this deployment, else null. */
export function ownStoreSlug(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const m = /^([a-z0-9-]+)\.(.+)$/.exec(h);
  if (!m) return null;
  const rest = m[2];
  if (rest !== base() && rest !== baseHost()) return null;
  return (SITE_SLUGS as readonly string[]).includes(m[1]) || STORES.some((s) => s.slug === m[1]) ? m[1] : null;
}

/** Origin to crawl for one of our stores: http locally, https in production (STORE_SCHEME overrides). */
export function storeOrigin(slug: string): string {
  const scheme = process.env.STORE_SCHEME || (isLocal() ? "http" : "https");
  return `${scheme}://${slug}.${base()}`;
}

/** Local dev only: our store hosts resolve to loopback, which the SSRF guard otherwise forbids. */
export function loopbackAllowedFor(hostname: string, port: string): boolean {
  if (!isLocal()) return false;
  const slug = ownStoreSlug(hostname);
  return !!slug && (port || "80") === (basePort() || "80");
}

export const isOwnStore = (host: string) => ownStoreSlug(host) !== null;
export const storeBySlug = (slug: string) => STORES.find((s) => s.slug === slug) ?? null;
