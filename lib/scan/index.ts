import { randomUUID } from "node:crypto";
import type { Db } from "../db";
import { getPool, many, one } from "../db";
import { getConfig, liveAgentAvailable } from "../config";
import { startRun, subscribe } from "../agent/runs";
import { txnSearch } from "../agent/tools/txnSearch";
import { nessieConfigured } from "../nessie/client";
import { metaKey, syncFromNessie, type SyncResult } from "../nessie/sync";
import { alertNewCharge, alertScanSummary, type ScanAlertMerchant } from "../safesignal";
import type { StepEvent, Verdict } from "../schemas";
import { basicVerdict, type BasicReport } from "./basic";
import type { Crawl } from "./crawl";
import type { SiteIntel } from "./intel";
import { linksFor, safeAlert, scanAlertMerchant, type ScanLink } from "./result";
import { reuseSiteScan, scanWebsite } from "./site";
import { latestSiteScan, type SiteScan } from "./store";
import { resolveWebsite } from "./website";

/**
 * The bank scan. Tier 1 (basic check): Nessie sync → resolve each merchant's website → crawl it + registry facts →
 * rules-only report. Tier 2 (deep analysis): a Nemotron agent reads the crawl and writes its own verdict.
 * One SSE stream per scan carries both tiers for every merchant. A partial scan (a live push, or new purchases the card
 * watcher found) covers only the merchants with those new charges.
 */
export type ScanMerchant = {
  key: string; merchant: string; host: string | null; descriptor: string; category: string | null; txns: { id: string; ts: string; amountCents: number }[]; totalCents: number;
  /** The exposure the linker ties to this merchant's newest charge (to the new charge, in a partial scan). */
  link?: ScanLink | null;
};
export type { ScanLink };
/** Why a scan ran: the user pressed Scan ("full"), a live Nessie push, or the card watcher found new purchases. */
export type ScanReason = "full" | "push" | "watch";
export type ScanOptions = {
  /** Re-crawl every site and run every deep review again (the "Re-crawl everything" button). */
  fresh?: boolean;
  deep?: boolean;
  /** Partial scan: only the merchants that have these transactions (new charges). */
  only?: { txnIds: string[] };
  /** The caller already imported the purchases (live push, card watcher). */
  skipSync?: boolean;
  /** Run a fresh Nemotron review even when one from the last 24 h exists (the crawl is still reused for 6 h). */
  freshReview?: boolean;
  reason?: ScanReason;
};
export type PageLite = { path: string; type: string; title: string; words: number; status: number };
export type CrawlLite = { origin: string; finalHost: string; https: boolean; ms: number; error?: string; ownStore: string | null; botBlocked: boolean; robots: boolean; sitemapUrls: number; pages: PageLite[]; failed: number; skippedByRobots: number; robotsHidden: number; rendered: number };
export type BasicPayload = { key: string; scanId: string; host: string; createdAt: string; cached: boolean; report: BasicReport; verdict: Verdict; intel: SiteIntel; crawl: CrawlLite };
export type ScanEvent =
  | { type: "merchants"; data: { sync: SyncResult | null; syncError?: string; merchants: ScanMerchant[]; deepAvailable: boolean; reason: ScanReason; partial?: boolean; newTxnIds?: string[] } }
  | { type: "status"; data: { key: string; phase: "queued" | "resolving" | "crawling" | "deep" | "done" | "error"; detail?: string } }
  | { type: "page"; data: { key: string; page: PageLite; n: number } }
  | { type: "basic"; data: BasicPayload }
  | { type: "deep_step"; data: { key: string; runId: string; step: StepEvent } }
  | { type: "deep"; data: { key: string; runId: string; verdict: Verdict | null; mode: string; error?: string } }
  | { type: "done"; data: { ms: number } };

export const crawlLite = (c: Crawl): CrawlLite => ({
  origin: c.origin, finalHost: c.finalHost, https: c.https, ms: c.ms, error: c.error, ownStore: c.ownStore, botBlocked: c.botBlocked, robots: c.robots.found, sitemapUrls: c.sitemapUrls,
  pages: c.pages.map((p) => ({ path: p.path, type: p.type, title: p.title, words: p.wordCount, status: p.status })), failed: c.failed.length, skippedByRobots: c.skippedByRobots.length, robotsHidden: c.robotsHidden?.length ?? 0, rendered: c.pages.filter((p) => p.rendered).length,
});
const basicPayload = (key: string, s: SiteScan, cached: boolean): BasicPayload => ({ key, scanId: s.id, host: s.host, createdAt: s.createdAt, cached, report: s.basic, verdict: basicVerdict(s.basic), intel: s.intel, crawl: crawlLite(s.crawl) });

type Row = { id: string; ts: Date; descriptor: string; amount_cents: number; merchant_name: string | null; website: string | null; mcc_category: string | null };
export async function recentMerchants(db: Db, userId: string, days = 45): Promise<ScanMerchant[]> {
  const rows = await many<Row>(db,
    `SELECT id, ts, descriptor, amount_cents, merchant_name, website, mcc_category FROM transactions
      WHERE user_id=$1 AND source='nessie' AND ts > now() - ($2 || ' days')::interval ORDER BY ts DESC`, [userId, String(days)]);
  const groups = new Map<string, ScanMerchant>();
  for (const r of rows) {
    const key = r.website ?? `merchant:${(r.merchant_name ?? r.descriptor).toLowerCase()}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { key, merchant: r.merchant_name ?? r.descriptor, host: r.website, descriptor: r.descriptor, category: r.mcc_category, txns: [], totalCents: 0 }));
    g.txns.push({ id: r.id, ts: r.ts.toISOString(), amountCents: r.amount_cents });
    g.totalCents += r.amount_cents;
  }
  return [...groups.values()];
}

// ---- in-memory job registry (same pattern as agent runs) ------------------------------------------------------------
type Job = { events: ScanEvent[]; listeners: Set<(e: ScanEvent) => void>; done: boolean; touched: number; userId: string };
const g = globalThis as unknown as { __bluffScans?: Map<string, Job> };
const jobs = (g.__bluffScans ??= new Map<string, Job>());

function push(id: string, e: ScanEvent) {
  const j = jobs.get(id);
  if (!j) return;
  j.events.push(e);
  j.touched = Date.now();
  for (const l of j.listeners) l(e);
  if (e.type === "done") j.done = true;
}

export function subscribeScan(id: string, userId: string, listener: (e: ScanEvent) => void): (() => void) | null {
  const j = jobs.get(id);
  if (!j || j.userId !== userId) return null;
  for (const e of j.events) listener(e);
  if (j.done) return () => {};
  j.listeners.add(listener);
  return () => j.listeners.delete(listener);
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const q = [...items];
  await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { for (let t = q.shift(); t !== undefined; t = q.shift()) await fn(t); }));
}

export function startBankScan(userId: string, opts: ScanOptions = {}): string {
  for (const [id, j] of jobs) if (j.done && Date.now() - j.touched > 10 * 60_000) jobs.delete(id);
  const id = randomUUID();
  jobs.set(id, { events: [], listeners: new Set(), done: false, touched: Date.now(), userId });
  void runScan(id, userId, opts).catch((e) => { console.error("[scan] failed", (e as Error).message); push(id, { type: "done", data: { ms: 0 } }); });
  return id;
}

async function runScan(id: string, userId: string, opts: ScanOptions) {
  const t0 = Date.now();
  const db = getPool();
  const only = opts.only?.txnIds.length ? new Set(opts.only.txnIds) : null;
  const reason: ScanReason = opts.reason ?? (only ? "push" : "full");
  let sync: SyncResult | null = null, syncError: string | undefined;
  if (!opts.skipSync) {
    if (nessieConfigured()) {
      try { sync = await syncFromNessie(db, userId); } catch (e) { syncError = `Couldn't reach Capital One Nessie: ${(e as Error).message.slice(0, 140)}`; }
    } else syncError = "Capital One Nessie isn't configured (NESSIE_API_KEY); showing transactions already imported.";
  }
  const all = await recentMerchants(db, userId);
  const merchants = only ? all.filter((m) => m.txns.some((t) => only.has(t.id))) : all;
  const links = await linksFor(db, userId, merchants, only ? (m) => m.txns.find((t) => only.has(t.id)) : undefined).catch(() => new Map<string, ScanLink>());
  for (const m of merchants) m.link = links.get(m.key) ?? null;
  const deepAvailable = opts.deep !== false && liveAgentAvailable(getConfig());
  push(id, { type: "merchants", data: { sync, syncError, merchants, deepAvailable, reason, ...(only ? { partial: true, newTxnIds: [...only] } : {}) } });
  for (const m of merchants) push(id, { type: "status", data: { key: m.key, phase: "queued" } });

  // Each merchant's final result (the deep verdict if it ran, else the basic check) goes to the phone via lib/safesignal.
  const results = new Map<string, ScanAlertMerchant>();
  const alerts: Promise<void>[] = [];
  const finish = (m: ScanMerchant, host: string | null, verdict: Verdict, mode: string, basic: BasicReport | null) => {
    const a = scanAlertMerchant(m, host, verdict, mode, basic);
    results.set(m.key, a);
    if (only) for (const t of m.txns.filter((x) => only.has(x.id))) alerts.push(safeAlert("new charge", () => alertNewCharge(db, { userId, txnId: t.id, merchant: a })));
  };

  const deepRuns: Promise<void>[] = [];
  await pool(merchants, 4, async (m) => {
    try {
      let host = m.host;
      if (!host) {
        push(id, { type: "status", data: { key: m.key, phase: "resolving" } });
        host = (await resolveWebsite({ merchant: m.merchant, descriptor: m.descriptor })).host;
      }
      const latest = m.txns[m.txns.length - 1];
      const hist = await txnSearch({ descriptor_norm: m.descriptor, days: 365 }, { userId, db, txnTs: new Date(latest.ts) });
      // A crawl of this site from the last 6 h by anyone is reused (re-scored with this user's payment history).
      let scan = host && !opts.fresh ? await reuseSiteScan(db, userId, host, 6, { priorCharges: hist.count }) : null;
      const cached = !!scan;
      if (!scan) {
        push(id, { type: "status", data: { key: m.key, phase: "crawling", detail: host ?? "no website found" } });
        scan = await scanWebsite(db, userId, {
          website: host, key: host ?? m.key, merchant: m.merchant, priorCharges: hist.count,
          crawl: { onPage: (p, n) => push(id, { type: "page", data: { key: m.key, page: { path: p.path, type: p.type, title: p.title, words: p.wordCount, status: p.status }, n } }) },
        });
      }
      const site = scan;
      push(id, { type: "basic", data: basicPayload(m.key, site, cached) });

      if (!deepAvailable) {
        finish(m, host, basicVerdict(site.basic), "basic", site.basic);
        push(id, { type: "status", data: { key: m.key, phase: "done", detail: "basic only" } });
        return;
      }
      push(id, { type: "status", data: { key: m.key, phase: "deep" } });
      const { runId } = await startRun({ kind: "site", userId, txnId: m.txns[0].id, host: host ?? m.key, merchant: m.merchant, descriptor: m.descriptor, scanId: site.id }, { fresh: opts.fresh || opts.freshReview || !cached });
      deepRuns.push(new Promise<void>((resolve) => {
        let verdict: Verdict | null = null, err: string | undefined;
        let unsub: (() => void) | null = null;
        let settled = false;
        const settle = (mode: string) => {
          if (settled) return;
          settled = true;
          finish(m, host, verdict ?? basicVerdict(site.basic), verdict ? mode : "basic", site.basic);
          resolve();
        };
        void subscribe(runId, (e) => {
          if (e.type === "step") push(id, { type: "deep_step", data: { key: m.key, runId, step: e.data } });
          if (e.type === "verdict") verdict = e.data;
          if (e.type === "error") { err = e.data.message; verdict = verdict ?? e.data.fallbackVerdict ?? null; }
          if (e.type === "done") {
            push(id, { type: "deep", data: { key: m.key, runId, verdict, mode: e.data.mode, error: err } });
            push(id, { type: "status", data: { key: m.key, phase: "done" } });
            unsub?.();
            settle(e.data.mode);
          }
        }).then((u) => { unsub = u; if (!u) settle("basic"); });
      }));
    } catch (e) {
      console.error("[scan] merchant failed", m.key, (e as Error).message);
      push(id, { type: "status", data: { key: m.key, phase: "error", detail: (e as Error).message.slice(0, 120) } });
    }
  });
  await Promise.all(deepRuns);
  if (!only) {
    const summary = merchants.map((m) => results.get(m.key)).filter((x): x is ScanAlertMerchant => !!x);
    alerts.push(safeAlert("scan summary", () => alertScanSummary(db, { userId, scanId: id, merchants: summary })));
  }
  await Promise.all(alerts);
  push(id, { type: "done", data: { ms: Date.now() - t0 } });
}

// ---- state for page load (no work started) ---------------------------------------------------------------------------
export type MerchantState = ScanMerchant & { basic: BasicPayload | null; deep: { verdict: Verdict; runId: string | null; createdAt: string } | null };
/** The Capital One account as last synced (bluff_meta). accountId and syncedAt exist only after a sync by this version. */
export type ScanAccount = { name: string; nickname: string; type?: string; accountId?: string; syncedAt?: string };

export async function scanState(userId: string): Promise<{ merchants: MerchantState[]; deepAvailable: boolean; configured: boolean; account: ScanAccount | null; lastSyncAt: string | null }> {
  const db = getPool();
  const merchants = await recentMerchants(db, userId);
  const links = await linksFor(db, userId, merchants).catch(() => new Map<string, ScanLink>());
  const out: MerchantState[] = [];
  for (const m of merchants) {
    const s = await latestSiteScan(db, userId, m.host ?? m.key);
    const v = await one<{ payload: Verdict; created_at: Date }>(db, "SELECT payload, created_at FROM verdicts WHERE user_id=$1 AND subject_type='site' AND subject_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, m.host ?? m.key]);
    const run = await one<{ id: string }>(db, "SELECT id FROM agent_runs WHERE user_id=$1 AND trigger='site' AND subject_id=$2 AND status <> 'running' ORDER BY started_at DESC LIMIT 1", [userId, m.host ?? m.key]);
    out.push({ ...m, link: links.get(m.key) ?? null, basic: s ? basicPayload(m.key, s, true) : null, deep: v && (!s || v.created_at.getTime() >= new Date(s.createdAt).getTime() - 60_000) ? { verdict: v.payload, runId: run?.id ?? null, createdAt: v.created_at.toISOString() } : null });
  }
  const acct = await one<{ value: string }>(db, "SELECT value FROM bluff_meta WHERE key=$1", [metaKey(userId)]).catch(() => null);
  let account: ScanAccount | null = null;
  try { account = acct ? (JSON.parse(acct.value) as ScanAccount) : null; } catch { account = null; }
  return { merchants: out, deepAvailable: liveAgentAvailable(getConfig()), configured: nessieConfigured(), account, lastSyncAt: account?.syncedAt ?? null };
}
