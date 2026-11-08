import dns from "node:dns/promises";
import tls from "node:tls";
import type { Db } from "../db";
import { one } from "../db";
import { guardedLookup, UA } from "./net";
import { ownStoreSlug } from "./stores";

/** Domain-level facts from public registries (no page content): RDAP, TLS certificate, mail DNS, Wayback Machine. */
export type SiteIntel = {
  domain: string;
  registration: { createdAt: string | null; ageDays: number | null; expiresAt: string | null; registrar: string | null; source: "rdap" | "demo_registry" | "unknown"; brandCloneOf?: string | null };
  tls: { ok: boolean; issuer: string | null; validFrom: string | null; validTo: string | null; ageDays: number | null; note?: string };
  dns: { mx: number | null; ns: string[] };
  wayback: { firstSeen: string | null; years: number | null; source: "archive.org" | "none" };
  allowlisted: boolean;
};

const DAY = 86_400_000;
const days = (iso: string | null) => (iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / DAY)) : null);
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "gov", "ac", "edu"]);

export function registrableDomain(host: string): string {
  const h = host.toLowerCase().replace(/:\d+$/, "").replace(/^www\./, "");
  const p = h.split(".");
  if (p.length <= 2) return h;
  return p.slice(SECOND_LEVEL.has(p[p.length - 2]) && p[p.length - 1].length === 2 ? -3 : -2).join(".");
}

async function rdap(domain: string) {
  try {
    const r = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, { headers: { accept: "application/rdap+json", "user-agent": UA }, signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const j = (await r.json()) as { events?: { eventAction: string; eventDate: string }[]; entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[] };
    const ev = (a: string) => j.events?.find((e) => e.eventAction === a)?.eventDate ?? null;
    const reg = j.entities?.find((e) => e.roles?.includes("registrar"));
    const fn = reg?.vcardArray?.[1]?.find((v) => v[0] === "fn")?.[3] ?? null;
    return { createdAt: ev("registration"), expiresAt: ev("expiration"), registrar: typeof fn === "string" ? fn : null };
  } catch { return null; }
}

function tlsInfo(host: string): Promise<SiteIntel["tls"]> {
  return new Promise((resolve) => {
    const s = tls.connect({ host, servername: host, port: 443, lookup: guardedLookup(false) as never, timeout: 5000 }, () => {
      const c = s.getPeerCertificate();
      const issuer = (c.issuer?.O as string | undefined) ?? (c.issuer?.CN as string | undefined) ?? null;
      const validFrom = c.valid_from ? new Date(c.valid_from).toISOString() : null;
      resolve({ ok: s.authorized, issuer, validFrom, validTo: c.valid_to ? new Date(c.valid_to).toISOString() : null, ageDays: days(validFrom), note: s.authorized ? undefined : String(s.authorizationError) });
      s.end();
    });
    s.on("error", (e) => resolve({ ok: false, issuer: null, validFrom: null, validTo: null, ageDays: null, note: e.message.slice(0, 80) }));
    s.on("timeout", () => { s.destroy(); resolve({ ok: false, issuer: null, validFrom: null, validTo: null, ageDays: null, note: "timeout" }); });
  });
}

async function wayback(domain: string): Promise<SiteIntel["wayback"]> {
  try {
    const r = await fetch(`https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(domain)}&output=json&limit=1&fl=timestamp`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { firstSeen: null, years: null, source: "none" };
    const j = (await r.json()) as string[][];
    const ts = j?.[1]?.[0];
    if (!ts) return { firstSeen: null, years: 0, source: "archive.org" };
    const iso = `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}`;
    return { firstSeen: iso, years: Math.floor((Date.now() - Date.parse(iso)) / (365.25 * DAY)), source: "archive.org" };
  } catch { return { firstSeen: null, years: null, source: "none" }; }
}

/** True when the domain is on the global allowlist or this user's own ("trust this site"). */
export async function isAllowlisted(db: Db, userId: string, domain: string): Promise<boolean> {
  if (!domain) return false;
  return !!(await one(db, "SELECT 1 FROM allowlist WHERE (host = $1 OR $1 LIKE '%.' || host) AND (user_id IS NULL OR user_id = $2) LIMIT 1", [domain, userId]).catch(() => null));
}

export async function siteIntel(db: Db, userId: string, host: string): Promise<SiteIntel> {
  const slug = ownStoreSlug(host);
  const domain = slug ? `${slug}.demo` : registrableDomain(host);
  const al = await isAllowlisted(db, userId, domain);

  if (slug) {
    // Our demo storefronts aren't registered domains; their "registry" facts come from the seeded demo registry.
    const reg = await one<{ created_on: Date; registrar: string; brand_clone_of: string | null }>(db, "SELECT created_on, registrar, brand_clone_of FROM mock_registry WHERE host=$1", [slug]).catch(() => null);
    const createdAt = reg ? new Date(reg.created_on).toISOString() : null;
    return {
      domain, allowlisted: false,
      registration: { createdAt, ageDays: days(createdAt), expiresAt: null, registrar: reg?.registrar ?? null, source: "demo_registry", brandCloneOf: reg?.brand_clone_of ?? null },
      tls: { ok: false, issuer: null, validFrom: null, validTo: null, ageDays: null, note: "demo storefront (local hosting)" },
      dns: { mx: 0, ns: [] }, wayback: { firstSeen: null, years: 0, source: "none" },
    };
  }
  const tlsHost = host.replace(/:\d+$/, "");
  const [r, t, mx, ns, wb] = await Promise.all([
    rdap(domain), tlsInfo(tlsHost),
    dns.resolveMx(domain).then((a) => a.length).catch(() => 0),
    dns.resolveNs(domain).then((a) => a.slice(0, 3)).catch(() => [] as string[]),
    wayback(domain),
  ]);
  return {
    domain, allowlisted: al,
    registration: r ? { ...r, ageDays: days(r.createdAt), source: "rdap" } : { createdAt: null, ageDays: null, expiresAt: null, registrar: null, source: "unknown" },
    tls: t, dns: { mx, ns }, wayback: wb,
  };
}
