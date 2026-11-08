import { createHash } from "node:crypto";
import type { Db } from "./db";
import { many, one } from "./db";
import { isRiskySite } from "./disputes";
import { findCandidates } from "./linker";
import { notify } from "./messaging/notify";
import { newChargeAlert, scanSummaryAlert } from "./messaging/templates";

/**
 * Safe Signal: the contract between the bank scan (lib/scan, which decides WHEN to alert) and the T-Mobile phone
 * (lib/messaging, which decides WHAT the text says and handles the replies). The scan only ever calls these three
 * functions; everything about message wording, dedupe, rate caps and reply commands lives behind them.
 * They never throw: a failed alert must not fail the scan.
 */

/** One merchant's result as the scan sees it, after its review (deep if available, else the basic check). */
export type ScanAlertMerchant = {
  /** Website host the charges were checked against, e.g. "voltdeals-outlet.bluffai.us" (or the merchant key when no site was found). */
  host: string;
  merchant: string;
  descriptor: string;
  label: "likely_scam" | "unsure" | "looks_ok";
  /** Trust score 0-100 (lower = riskier). */
  score: number;
  /** 0-1, computed server-side from signal agreement. */
  confidence: number;
  /** "live" | "cached" | "replayed" | "basic" | "mock" … as reported by the run. */
  mode: string;
  /** Short top reason, e.g. "Domain registered 20 days ago but claims to be founded in 2016". */
  topFinding: string | null;
  /** All charges from this merchant in the scanned window (newest first) and their total. */
  txnIds: string[];
  latestTxnId: string;
  totalCents: number;
};

/** Reply chips the phone shows under a scan alert (meta.actions). */
export const SCAN_ACTIONS = ["DISPUTE", "HOLD", "SAFE"] as const;

const UUID = /^[0-9a-f-]{36}$/i;
const isBasicMode = (mode: string) => mode === "basic" || mode === "mock";
/** Calendar day in America/Chicago, e.g. "2026-11-07" (the demo's local day). */
const chicagoDay = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const digest = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/** Hosts in `hosts` that this user marked SAFE. */
async function allowlisted(db: Db, userId: string, hosts: string[]): Promise<Set<string>> {
  if (!hosts.length) return new Set();
  return new Set((await many<{ host: string }>(db, "SELECT host FROM allowlist WHERE user_id=$1 AND host = ANY($2::text[])", [userId, hosts])).map((r) => r.host));
}

/** A full bank scan finished. Sends at most ONE summary text listing the risky merchants (none when nothing is risky). */
export async function alertScanSummary(db: Db, args: { userId: string; scanId: string; merchants: ScanAlertMerchant[] }): Promise<void> {
  try {
    const { userId, merchants } = args;
    const safe = await allowlisted(db, userId, merchants.map((m) => m.host));
    const risky = merchants.filter((m) => isRiskySite(m) && !safe.has(m.host) && UUID.test(m.latestTxnId));
    if (!risky.length) return;
    // Newest charge first.
    const latest = await many<{ id: string; ts: Date }>(db, "SELECT id, ts FROM transactions WHERE user_id=$1 AND id = ANY($2::uuid[])", [userId, risky.map((m) => m.latestTxnId)]);
    const tsOf = new Map(latest.map((r) => [r.id, r.ts.getTime()]));
    risky.sort((a, b) => (tsOf.get(b.latestTxnId) ?? 0) - (tsOf.get(a.latestTxnId) ?? 0));
    const newest = risky[0];
    // Same risky charges on the same (Chicago) day → same key → re-running the scan doesn't text again.
    const ids = [...new Set(risky.flatMap((m) => (m.txnIds.length ? m.txnIds : [m.latestTxnId])))].sort();
    const body = scanSummaryAlert({
      merchantsChecked: merchants.length,
      risky: risky.map((m) => ({ descriptor: m.descriptor, amountCents: m.totalCents, charges: Math.max(1, m.txnIds.length), score: m.score, label: m.label })),
    });
    await notify(db, {
      userId, eventKey: `scan-summary:${userId}:${chicagoDay()}:${digest(ids.join(","))}`, body,
      meta: { source: "scan", alert: "scan_summary", scan_id: args.scanId, txn_id: newest.latestTxnId, host: newest.host, txn_ids: ids, actions: [...SCAN_ACTIONS] },
    });
  } catch (e) {
    console.error("[safesignal] scan summary failed", (e as Error).message);
  }
}

/** A single NEW charge (live Nessie push or the card watcher) finished its review. Texts the user when it looks risky. */
export async function alertNewCharge(db: Db, args: { userId: string; txnId: string; merchant: ScanAlertMerchant }): Promise<void> {
  try {
    const { userId, txnId, merchant: m } = args;
    if (!isRiskySite(m) || !UUID.test(txnId)) return;
    if ((await allowlisted(db, userId, [m.host])).size) return;
    const t = await one<{ ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number }>(db, "SELECT ts, descriptor, descriptor_norm, amount_cents FROM transactions WHERE id=$1 AND user_id=$2", [txnId, userId]);
    if (!t) return;
    // The linker ties the charge to an exposure: a site where the user entered info, or a scam text they reported.
    const link = await findCandidates(db, userId, { ts: t.ts, descriptor: t.descriptor, descriptorNorm: t.descriptor_norm });
    const exp = link.best?.kind === "flagged"
      ? await one<{ id: string; user_action: string; created_at: Date; field_types: string[] }>(db, "SELECT id, user_action, created_at, field_types FROM exposures WHERE id=$1 AND user_id=$2", [link.best.exposureId, userId])
      : null;
    const v = await one<{ id: string }>(db, "SELECT id FROM verdicts WHERE user_id=$1 AND subject_type='site' AND subject_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, m.host]);
    const body = newChargeAlert({
      amountCents: t.amount_cents, descriptor: t.descriptor, host: m.host, label: m.label, score: m.score, confidence: m.confidence,
      topFinding: m.topFinding, basic: isBasicMode(m.mode),
      linked: exp ? { via: exp.user_action === "received_link" ? "text" : "entered", at: exp.created_at, fieldTypes: exp.field_types } : null,
    });
    // charge:<txn> is the same key as the exposure-linked charge alert, so one charge never texts twice.
    await notify(db, {
      userId, eventKey: `charge:${txnId}`, verdictId: v?.id ?? null, body,
      meta: { source: "scan", alert: "new_charge", txn_id: txnId, host: m.host, ...(exp ? { exposure_id: exp.id } : {}), actions: [...SCAN_ACTIONS] },
    });
  } catch (e) {
    console.error("[safesignal] new-charge alert failed", (e as Error).message);
  }
}

/** Safe Signal hold (simulated card lock, set by replying HOLD). While held, new pushed purchases are declined before reaching Nessie. */
export async function cardHold(db: Db, userId: string): Promise<{ held: boolean; since: string | null }> {
  const r = await one<{ card_hold_at: Date | null }>(db, "SELECT card_hold_at FROM users WHERE id=$1", [userId]).catch(() => null);
  return { held: !!r?.card_hold_at, since: r?.card_hold_at ? r.card_hold_at.toISOString() : null };
}

/** Turn the hold on (keeps the original start time) or off. Returns the new state and whether it changed. */
export async function setCardHold(db: Db, userId: string, on: boolean): Promise<{ held: boolean; since: string | null; changed: boolean }> {
  const before = await cardHold(db, userId);
  if (before.held === on) return { ...before, changed: false };
  await db.query(`UPDATE users SET card_hold_at=${on ? "now()" : "NULL"} WHERE id=$1`, [userId]);
  return { ...(await cardHold(db, userId)), changed: true };
}
