import { STORES } from "../../data/stores";

/** The only form of a page address that leaves the browser: its origin ("https://shop.example/"), never path, query or hash. */
export function originOnly(url: string): string {
  return `${new URL(url).origin}/`;
}

/** Hostname of the app the extension was built for (no port, no www.). */
export function appHostname(app: string): string {
  return new URL(app).hostname.toLowerCase().replace(/^www\./, "");
}

/** host[:port] the demo stores hang off: the apex, also for a build made against the old bluff.<domain> address. */
function storeBase(app: string): string {
  const host = new URL(app).host.toLowerCase().replace(/^www\./, "");
  const rest = host.startsWith("bluff.") ? host.slice("bluff.".length) : "";
  return rest.includes(".") || rest.startsWith("localhost") ? rest : host;
}

/** Same shape as lib/config storeOrigin(): https://fastkicks-shop.bluffai.us, http://fastkicks-shop.localhost:3000 locally. */
export function storeUrl(app: string, slug: string): string {
  return `${new URL(app).protocol}//${slug}.${storeBase(app)}`;
}

/** Slug of one of Bluff's own demo stores when `host` is <slug>.<app domain>, else null. */
export function demoStoreSlug(host: string, app: string): string | null {
  const suffix = "." + storeBase(app).replace(/:\d+$/, "");
  const h = host.toLowerCase();
  if (!h.endsWith(suffix)) return null;
  const slug = h.slice(0, -suffix.length);
  return STORES.some((s) => s.slug === slug) ? slug : null;
}

export type PanelLink = { label: string; href: string; primary?: boolean };

/**
 * Where the panel points after "Continue": on a demo store, straight to making that purchase on the sandbox test card
 * (so the bank scan can link the charge back to this visit); anywhere else, to the exposure log on /check.
 */
export function loggedLinks(app: string, host: string): { links: PanelLink[]; note?: string } {
  const log: PanelLink = { label: "See it in your exposure log", href: `${app}/check#exposures` };
  const slug = demoStoreSlug(host, app);
  if (!slug) return { links: [{ ...log, primary: true }] };
  return {
    links: [{ label: "Make this purchase on the test card", href: `${app}/scan?push=${encodeURIComponent(slug)}`, primary: true }, log],
    note: "Demo store: the purchase is simulated on Bluff's sandbox test card. No real money moves.",
  };
}
