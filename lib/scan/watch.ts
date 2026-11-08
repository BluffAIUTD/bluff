import { getPool } from "../db";
import { nessieConfigured } from "../nessie/client";
import { PURCHASES_TTL_MS } from "../nessie/cache";
import { syncFromNessie } from "../nessie/sync";
import { startBankScan } from "./index";

/**
 * "Watching your card": /scan polls this every ~20 s while it is visible. Each poll syncs the visitor's card from
 * Capital One Nessie (at most once per 15 s per visitor; the purchase list itself is shared by all visitors for ~10 s)
 * and starts a partial scan of any purchases that are new since the last check, wherever they were posted from.
 */
export const WATCH_THROTTLE_MS = 15_000;
/** A purchase dated within this window counts as a new charge (Nessie dates are calendar days). */
const NEW_CHARGE_MAX_AGE_MS = 3 * 86_400_000;
const MAX_NEW_PER_CHECK = 8;

export type WatchResult = {
  configured: boolean;
  /** when Bluff last read the card's purchases from Nessie (ISO), null before the first successful read */
  checkedAt: string | null;
  /** partial scan of the new purchases, when there were any */
  scanId: string | null;
  newTxnIds: string[];
  /** rows imported by this check (on a visitor's first check these are their starting history, not new charges) */
  imported: number;
  firstSync: boolean;
  throttled: boolean;
  error?: string;
};

type Last = { at: number; checkedAt: string | null };
const g = globalThis as unknown as { __bluffWatch?: Map<string, Last> };
const last = (g.__bluffWatch ??= new Map<string, Last>());

export async function watchCard(userId: string, now = Date.now()): Promise<WatchResult> {
  const idle = { scanId: null, newTxnIds: [] as string[], imported: 0, firstSync: false };
  if (!nessieConfigured()) return { configured: false, checkedAt: null, throttled: false, ...idle };
  const prev = last.get(userId);
  if (prev && now - prev.at < WATCH_THROTTLE_MS) return { configured: true, checkedAt: prev.checkedAt, throttled: true, ...idle };
  if (last.size > 20_000) last.clear();
  last.set(userId, { at: now, checkedAt: prev?.checkedAt ?? null }); // claim the slot before the network call
  try {
    const sync = await syncFromNessie(getPool(), userId, { maxAgeMs: PURCHASES_TTL_MS });
    last.set(userId, { at: now, checkedAt: sync.checkedAt });
    // A visitor's first sync imports their whole history: that is a starting point (press Scan), not a burst of new
    // charges. Likewise old-dated purchases re-imported later (e.g. after a reset) are history; only recent ones are new.
    const fresh = sync.firstSync ? [] : sync.newTxns.filter((t) => now - new Date(t.ts).getTime() <= NEW_CHARGE_MAX_AGE_MS).slice(0, MAX_NEW_PER_CHECK).map((t) => t.id);
    const scanId = fresh.length ? startBankScan(userId, { only: { txnIds: fresh }, skipSync: true, reason: "watch" }) : null;
    return { configured: true, checkedAt: sync.checkedAt, scanId, newTxnIds: fresh, imported: sync.inserted, firstSync: sync.firstSync, throttled: false };
  } catch (e) {
    console.warn("[watch] sync failed", (e as Error).message);
    return { configured: true, checkedAt: prev?.checkedAt ?? null, throttled: false, ...idle, error: "Couldn't reach Capital One Nessie. Bluff will try again shortly." };
  }
}

/** Tests only. */
export function resetWatch() { last.clear(); }
