import type { Db } from "./db";

/**
 * Safe Signal: the contract between the bank scan (lib/scan, which decides WHEN to alert) and the T-Mobile phone
 * (lib/messaging, which decides WHAT the text says and handles the replies). The scan only ever calls these three
 * functions; everything about message wording, dedupe, rate caps and reply commands lives behind them.
 *
 * STUB: the phone-side implementation replaces these bodies. Signatures are fixed; keep them stable.
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

/** A full bank scan finished. Sends at most ONE summary text listing the risky merchants (none when nothing is risky). */
export async function alertScanSummary(_db: Db, _args: { userId: string; scanId: string; merchants: ScanAlertMerchant[] }): Promise<void> {
  // implemented by the T-Mobile/Safe Signal stream
}

/** A single NEW charge (live Nessie push or the card watcher) finished its review. Texts the user when it looks risky. */
export async function alertNewCharge(_db: Db, _args: { userId: string; txnId: string; merchant: ScanAlertMerchant }): Promise<void> {
  // implemented by the T-Mobile/Safe Signal stream
}

/** Safe Signal hold (simulated card lock, set by replying HOLD). While held, new pushed purchases are declined before reaching Nessie. */
export async function cardHold(_db: Db, _userId: string): Promise<{ held: boolean; since: string | null }> {
  return { held: false, since: null };
}
