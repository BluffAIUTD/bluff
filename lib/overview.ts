import type { Db } from "./db";
import { many } from "./db";
import { listExposures } from "./exposures";
import { listTransactionsWithFlags } from "./rules/flags";
import { cardHold } from "./safesignal";
import { scanState, type MerchantState } from "./scan";
import type { Verdict } from "./schemas";
import type { FlagKindDto } from "./types";

const ATTENTION = new Set<FlagKindDto>(["exposure_link", "card_test", "price_drift", "duplicate"]);
const DAY = 86_400_000;
const SEVERITY_ORDER = ["high", "medium"] as const;

/** A merchant the bank scan flagged (its website looks like a scam, or Bluff is unsure). */
export type ScanAttention = {
  kind: "scan"; key: string; merchant: string; host: string | null;
  label: "likely_scam" | "unsure"; score: number; mode: Verdict["mode"]; reason: string;
  totalCents: number; charges: number; latestTxnId: string; latestTs: string;
  /** Rule flags on this merchant's charges (shown on the same row instead of a duplicate rule row). */
  flags: FlagKindDto[];
};
/** A single charge flagged by the transaction rules (card test, duplicate, price drift, linked exposure). */
export type RuleAttention = { kind: "rule"; id: string; ts: string; descriptor: string; amountCents: number; flags: FlagKindDto[] };
export type AttentionItem = ScanAttention | RuleAttention;

export type ScanSummary = {
  /** "Maya Lopez · Credit Card ••1234" once the Capital One (Nessie) account has been read, else null. */
  account: string | null;
  merchants: number; charges: number;
  likelyScams: number; unsure: number;
  /** Charges from merchants whose site is a likely scam. */
  riskyCharges: number;
  /** All charges from likely-scam or unsure merchants (same rule as the /scan page). */
  atRiskCents: number;
  /** Newest crawl or review of any merchant on the card; null when nothing was ever scanned. */
  lastScanAt: string | null;
  scannedMerchants: number; reviewedByNemotron: number;
  deepAvailable: boolean; configured: boolean;
};

/** The verdict to lead with, same rule as the /scan page: the Nemotron review when it ran live (or was reused), else the basic check. */
export function headlineVerdict(m: Pick<MerchantState, "basic" | "deep">): Verdict | null {
  const d = m.deep?.verdict;
  if (d && (d.mode === "live" || d.mode === "cached")) return d;
  return m.basic?.verdict ?? null;
}

/** The single most important reason behind a verdict: the first high (then medium) finding, else the first evidence line. */
export function topReason(v: Verdict, m?: Pick<MerchantState, "basic">): string {
  const findings: { severity: string; title: string }[] = v.analysis?.findings ?? (v.mode === "basic" ? m?.basic?.report.findings ?? [] : []);
  for (const s of SEVERITY_ORDER) { const f = findings.find((x) => x.severity === s); if (f) return f.title; }
  return v.evidence[0] ?? "";
}

type ScanState = Awaited<ReturnType<typeof scanState>>;

export function summarizeScan(s: ScanState): { summary: ScanSummary; flagged: Omit<ScanAttention, "flags">[] } {
  let likelyScams = 0, unsure = 0, riskyCharges = 0, atRiskCents = 0, scanned = 0, nemotron = 0, charges = 0;
  let last: number | null = null;
  const flagged: Omit<ScanAttention, "flags">[] = [];
  for (const m of s.merchants) {
    charges += m.txns.length;
    for (const t of [m.basic?.createdAt, m.deep?.createdAt]) if (t) last = Math.max(last ?? 0, Date.parse(t));
    if (m.basic || m.deep) scanned++;
    const v = headlineVerdict(m);
    if (v && v.mode !== "basic") nemotron++;
    if (!v || v.verdict === "looks_ok" || !m.txns.length) continue;
    if (v.verdict === "likely_scam") { likelyScams++; riskyCharges += m.txns.length; } else unsure++;
    atRiskCents += m.totalCents;
    flagged.push({
      kind: "scan", key: m.key, merchant: m.merchant, host: m.host, label: v.verdict, score: v.score, mode: v.mode, reason: topReason(v, m),
      totalCents: m.totalCents, charges: m.txns.length, latestTxnId: m.txns[0].id, latestTs: m.txns[0].ts,
    });
  }
  flagged.sort((a, b) => (a.label === b.label ? a.score - b.score : a.label === "likely_scam" ? -1 : 1));
  return {
    summary: {
      account: s.account ? `${s.account.name} · ${s.account.nickname}` : null,
      merchants: s.merchants.length, charges, likelyScams, unsure, riskyCharges, atRiskCents,
      lastScanAt: last === null ? null : new Date(last).toISOString(), scannedMerchants: scanned, reviewedByNemotron: nemotron,
      deepAvailable: s.deepAvailable, configured: s.configured,
    },
    flagged,
  };
}

/** Everything the home page shows, in one pass: the card scan (one scanState call), rule-flagged charges, texts sent, the Safe Signal hold. */
export async function loadOverview(db: Db, userId: string, now = new Date()) {
  const [scan, exposures, txns, messages, hold] = await Promise.all([
    scanState(userId),
    listExposures(db, userId),
    listTransactionsWithFlags(db, userId, 100),
    many<{ id: string; body: string; status: string; created_at: Date }>(db, "SELECT id, body, status, created_at FROM messages WHERE user_id=$1 AND direction='out' ORDER BY created_at DESC LIMIT 5", [userId]),
    cardHold(db, userId).catch(() => ({ held: false, since: null })),
  ]);
  const { summary, flagged } = summarizeScan(scan);

  // Scan-flagged merchants first; a rule flag on one of their charges joins that row instead of repeating it.
  const scanRows: ScanAttention[] = flagged.map((f) => ({ ...f, flags: [] }));
  const rowOf = new Map(scanRows.map((r) => [r.key, r]));
  const owner = new Map<string, ScanAttention>();
  for (const m of scan.merchants) { const r = rowOf.get(m.key); if (r) for (const t of m.txns) owner.set(t.id, r); }
  const ruleRows: RuleAttention[] = [];
  for (const t of txns) {
    if (Date.parse(t.ts) < now.getTime() - 14 * DAY || !t.flags.some((f) => ATTENTION.has(f))) continue;
    const row = owner.get(t.id);
    if (row) { for (const f of t.flags) if (ATTENTION.has(f) && !row.flags.includes(f)) row.flags.push(f); continue; }
    ruleRows.push({ kind: "rule", id: t.id, ts: t.ts, descriptor: t.descriptor, amountCents: t.amountCents, flags: t.flags });
  }

  const weekAgo = now.getTime() - 7 * DAY;
  return {
    scan: summary,
    needsAttention: [...scanRows, ...ruleRows] as AttentionItem[],
    hold,
    exposuresThisWeek: exposures.filter((e) => Date.parse(e.createdAt) >= weekAgo).length,
    alerts: messages.map((m) => ({ id: m.id, body: m.body, status: m.status, createdAt: m.created_at.toISOString() })),
  };
}

export type Overview = Awaited<ReturnType<typeof loadOverview>>;
