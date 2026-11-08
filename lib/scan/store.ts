import type { Db } from "../db";
import { one } from "../db";
import type { BasicReport } from "./basic";
import type { Crawl } from "./crawl";
import type { SiteIntel } from "./intel";

export type SiteScan = { id: string; host: string; merchant: string | null; crawl: Crawl; intel: SiteIntel; basic: BasicReport; createdAt: string };
type Row = { id: string; host: string; merchant: string | null; crawl: Crawl; intel: SiteIntel; basic: BasicReport; created_at: Date };
const toScan = (r: Row): SiteScan => ({ id: r.id, host: r.host, merchant: r.merchant, crawl: r.crawl, intel: r.intel, basic: r.basic, createdAt: r.created_at.toISOString() });

export async function saveSiteScan(db: Db, userId: string, s: Omit<SiteScan, "id" | "createdAt">): Promise<SiteScan> {
  const r = await one<Row>(db, "INSERT INTO site_scans (user_id, host, merchant, crawl, intel, basic) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
    [userId, s.host, s.merchant, JSON.stringify(s.crawl), JSON.stringify(s.intel), JSON.stringify(s.basic)]);
  return toScan(r!);
}

export async function loadSiteScan(db: Db, id: string): Promise<SiteScan | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const r = await one<Row>(db, "SELECT * FROM site_scans WHERE id=$1", [id]);
  return r ? toScan(r) : null;
}

/** Most recent crawl of `host` for this user, if younger than `maxAgeHours`. */
export async function latestSiteScan(db: Db, userId: string, host: string, maxAgeHours = 24 * 365): Promise<SiteScan | null> {
  const r = await one<Row>(db, "SELECT * FROM site_scans WHERE user_id=$1 AND host=$2 AND created_at > now() - ($3 || ' hours')::interval ORDER BY created_at DESC LIMIT 1", [userId, host, String(maxAgeHours)]);
  return r ? toScan(r) : null;
}

/** Most recent crawl of `host` by anyone, if younger than `maxAgeHours`, with the account that ran it. */
export async function latestSharedSiteScan(db: Db, host: string, maxAgeHours: number): Promise<{ scan: SiteScan; userId: string } | null> {
  const r = await one<Row & { user_id: string }>(db, "SELECT * FROM site_scans WHERE host=$1 AND created_at > now() - ($2 || ' hours')::interval ORDER BY created_at DESC LIMIT 1", [host, String(maxAgeHours)]);
  return r ? { scan: toScan(r), userId: r.user_id } : null;
}
