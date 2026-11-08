import { getConfig } from "../../config";
import { one } from "../../db";
import { labelFromHost } from "../../linker/normalize";
import { str, type ToolDef } from "./types";

const DAY = 86_400_000;
const RISKY_TLDS = new Set(["top", "xyz", "icu", "help", "click", "live", "support", "work", "rest", "cfd", "sbs"]);

export type DomainIntelResult = {
  host: string; age_days: number | null; registrar: string | null; tld_risk: boolean; brand_clone_of: string | null;
  allowlisted: boolean; source: "mock_registry" | "rdap" | "unknown";
};

/** RDAP lookup with a 3 s timeout (P2 feature, behind RDAP_ENABLED). Returns age in days or null. */
export async function rdapAgeDays(host: string, fetchImpl: typeof fetch = fetch): Promise<{ ageDays: number; registrar: string | null } | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 3000);
  try {
    const res = await fetchImpl(`https://rdap.org/domain/${encodeURIComponent(host)}`, { signal: ctl.signal, headers: { accept: "application/rdap+json", "user-agent": "Mozilla/5.0 (compatible; BluffScanner/1.0; +https://github.com/Sithranjan-Suresh)" } });
    if (!res.ok) return null;
    const j = (await res.json()) as { events?: { eventAction: string; eventDate: string }[]; entities?: { roles?: string[]; vcardArray?: unknown[] }[] };
    const reg = j.events?.find((e) => e.eventAction === "registration")?.eventDate;
    if (!reg) return null;
    const ageDays = Math.floor((Date.now() - new Date(reg).getTime()) / DAY);
    return Number.isFinite(ageDays) ? { ageDays, registrar: null } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function domainIntel(host: string, ctx: Parameters<ToolDef["run"]>[1], fetchImpl: typeof fetch = fetch): Promise<DomainIntelResult> {
  const c = getConfig();
  const h = host.toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  const label = labelFromHost(h, ctx.baseDomain ?? c.baseDomain);
  const tld = h.split(".").pop() ?? "";
  const base: DomainIntelResult = { host: h, age_days: null, registrar: null, tld_risk: RISKY_TLDS.has(tld), brand_clone_of: null, allowlisted: false, source: "unknown" };

  const al = await one(ctx.db, "SELECT 1 FROM allowlist WHERE (host = $1 OR $1 LIKE '%.' || host) AND (user_id IS NULL OR user_id = $2) LIMIT 1", [h, ctx.userId]);
  base.allowlisted = !!al;

  const reg = await one<{ created_on: Date; registrar: string; brand_clone_of: string | null }>(
    ctx.db, "SELECT created_on, registrar, brand_clone_of FROM mock_registry WHERE host = $1", [label],
  );
  if (reg) {
    const now = ctx.now ?? new Date();
    return { ...base, age_days: Math.max(0, Math.floor((now.getTime() - new Date(reg.created_on).getTime()) / DAY)), registrar: reg.registrar, brand_clone_of: reg.brand_clone_of, source: "mock_registry" };
  }
  if (c.rdapEnabled && h.includes(".")) {
    const r = await rdapAgeDays(h, fetchImpl);
    if (r) return { ...base, age_days: r.ageDays, registrar: r.registrar, source: "rdap" };
  }
  return base; // "age unknown"
}

export const domainIntelTool: ToolDef = {
  name: "domain_intel",
  description: "Look up a host's age, registrar, brand-clone flag and whether it is a well-known allowlisted site. age_days null means unknown.",
  parameters: { type: "object", properties: { host: { type: "string", description: "hostname such as fastkicks-shop.example.com" } }, required: ["host"] },
  run: async (args, ctx) => domainIntel(str(args.host, 255), ctx),
};
