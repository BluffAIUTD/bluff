import type { Db } from "../db";
import { many } from "../db";
import { findCandidates } from "../linker";
import type { ScanAlertMerchant } from "../safesignal";
import type { Verdict } from "../schemas";
import type { BasicReport } from "./basic";

/** A merchant group as the scan sees it (mirrors ScanMerchant without importing the scan module). */
type Group = { key: string; merchant: string; host: string | null; descriptor: string; txns: { id: string; ts: string; amountCents: number }[]; totalCents: number };
type FindingLike = { title: string; severity: string };

const RISK_FIRST: Record<string, number> = { high: 0, medium: 1, low: 2, info: 3, good: 4 };
const GOOD_FIRST: Record<string, number> = { good: 0, info: 1, low: 2, medium: 3, high: 4 };

/**
 * The best single reason behind a result: for a risky label the most severe risk finding, for "looks OK" the first good
 * sign. Deep verdicts use Nemotron's findings (each tied to a page); basic results use the rules check's findings.
 */
export function topFinding(verdict: Verdict, basic: BasicReport | null): string | null {
  const findings: FindingLike[] = verdict.analysis?.findings?.length ? verdict.analysis.findings : verdict.mode === "basic" ? basic?.findings ?? [] : [];
  const ok = verdict.verdict === "looks_ok";
  const order = ok ? GOOD_FIRST : RISK_FIRST;
  const wanted = ok ? ["good"] : ["high", "medium", "low"];
  const best = findings.filter((f) => wanted.includes(f.severity)).sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9))[0];
  return (best?.title ?? verdict.evidence[0] ?? null)?.slice(0, 140) ?? null;
}

/** One merchant's final result in the shape lib/safesignal.ts expects. */
export function scanAlertMerchant(m: Group, host: string | null, verdict: Verdict, mode: string, basic: BasicReport | null): ScanAlertMerchant {
  return {
    host: host ?? m.host ?? m.key, merchant: m.merchant, descriptor: m.descriptor,
    label: verdict.verdict, score: verdict.score, confidence: verdict.confidence, mode,
    topFinding: topFinding(verdict, basic),
    txnIds: m.txns.map((t) => t.id), latestTxnId: m.txns[0]?.id ?? "", totalCents: m.totalCents,
  };
}

/** Alerts must never break a scan: errors are logged, and a slow phone side is not waited on for more than 5 s. */
export async function safeAlert(what: string, fn: () => Promise<void>): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([fn(), new Promise<void>((r) => { timer = setTimeout(() => { console.warn(`[scan] ${what} alert still running after 5 s`); r(); }, 5_000); })]);
  } catch (e) {
    console.error(`[scan] ${what} alert failed`, (e as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

// ---- link memory: does this charge match a site where the user typed their card? ---------------------------------------

/**
 * userAction comes straight from the exposure: 'continue' / 'watch' (a page check), 'received_link' (a link in a scam
 * text the user reported). Unknown values are shown like a page check.
 */
export type ScanLink = { exposureId: string; host: string; at: string; userAction: string; fieldTypes: string[]; kind: "flagged" | "expected"; txnId: string };

/** The exposure (if any) the linker ties to `txnId`, for each merchant group (one linker query per group). */
export async function linksFor(db: Db, userId: string, groups: Group[], pick: (g: Group) => { id: string; ts: string } | undefined = (g) => g.txns[0]): Promise<Map<string, ScanLink>> {
  const out = new Map<string, ScanLink>();
  for (const g of groups) {
    const t = pick(g);
    if (!t) continue;
    try {
      const r = await findCandidates(db, userId, { ts: new Date(t.ts), descriptor: g.descriptor });
      if (r.best) out.set(g.key, { exposureId: r.best.exposureId, host: r.best.host, at: r.best.exposureAt, userAction: "continue", fieldTypes: r.best.fieldTypes, kind: r.best.kind, txnId: t.id });
    } catch (e) { console.warn("[scan] linker failed", g.key, (e as Error).message); }
  }
  if (out.size) {
    const rows = await many<{ id: string; user_action: string }>(db, "SELECT id, user_action FROM exposures WHERE id = ANY($1::uuid[])", [[...out.values()].map((l) => l.exposureId)]).catch(() => []);
    const ua = new Map(rows.map((r) => [r.id, r.user_action]));
    for (const l of out.values()) l.userAction = ua.get(l.exposureId) ?? "continue";
  }
  return out;
}
