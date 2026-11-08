import type { Db } from "../db";
import { many, one } from "../db";
import { refreshMerchantDaily } from "../db/aggregate";
import { websiteFromText } from "../scan/website";
import { accountPurchases, bankAccounts, BANK_TTL_MS, forgetNessieCache, merchantById, type PurchaseList } from "./cache";
import { NessieError, type NessieAccount, type NessiePurchase } from "./client";
import { chicagoDate, pushRef, splitRef } from "./ref";
import { insertNessieRows, withNessieLock, type NessieRow } from "./rows";

export type SyncResult = {
  customer: { id: string; name: string };
  accounts: { id: string; type: string; nickname: string; last4: string }[];
  fetched: number; inserted: number; removed: number;
  /** transactions rows this sync created, newest first */
  newTxnIds: string[];
  /** the same rows with their (mirrored) timestamps */
  newTxns: { id: string; ts: string }[];
  /** purchases pushed by other visitors (tagged with their ref), not shown to this one */
  hidden: number;
  /** this visitor had never synced before: everything imported is their starting point, not "new" */
  firstSync: boolean;
  /** when the purchase list used was read from Nessie (ISO) */
  checkedAt: string;
};

export type SyncOptions = {
  /** Reuse a purchase list read within this many ms (shared by all visitors; 0 = read now). The card watcher uses ~10 s. */
  maxAgeMs?: number;
  now?: Date;
};

/** "NETFLIX.COM · netflix.com" → descriptor "NETFLIX.COM". Falls back to the merchant name. A visitor ref is ignored. */
export function descriptorFrom(description: string | undefined, merchantName: string): string {
  const d = splitRef(description).text.split(" · ")[0].trim();
  return (d || merchantName || "UNKNOWN MERCHANT").slice(0, 120);
}

/**
 * Nessie dates are calendar days: pin older days to midday Central so the day never shifts in the UI. A purchase dated
 * today (Chicago) is mirrored at `now`: it was just seen, and a midday pin would put an afternoon charge before the scam
 * text reported earlier that afternoon, so the text-to-charge link (`created_at <= txn.ts`) would never match.
 */
export function mirroredTs(purchaseDate: string, now = new Date()): Date {
  if (purchaseDate === chicagoDate(now)) return now;
  const ts = new Date(`${purchaseDate}T18:00:00Z`);
  return Number.isNaN(ts.getTime()) || ts > now ? now : ts;
}

export const metaKey = (userId: string) => `nessie_account:${userId}`;

/** Per visitor, the newest purchase list applied: an older (cached) list never undoes what a newer one imported. */
const g = globalThis as unknown as { __bluffNessieApplied?: Map<string, number> };
const applied = (g.__bluffNessieApplied ??= new Map<string, number>());

/** Statement row for one Nessie purchase (the visitor ref is stripped before reading descriptor and website). */
export async function rowFor(p: NessiePurchase, now: Date): Promise<NessieRow> {
  const m = await merchantById(p.merchant_id);
  const merchantName = m?.name ?? "Unknown merchant";
  const text = splitRef(p.description).text;
  const category = (Array.isArray(m?.category) ? m?.category[0] : m?.category) ?? null;
  return {
    externalId: p._id, ts: mirroredTs(p.purchase_date, now), descriptor: descriptorFrom(text, merchantName), amountCents: Math.round(p.amount * 100),
    category: category?.toLowerCase() ?? null, merchantName, website: websiteFromText(text) ?? websiteFromText(merchantName),
  };
}

/**
 * Pull the customer's accounts and purchases from Capital One Nessie and mirror them into this visitor's `transactions`
 * (source='nessie', external_id = Nessie purchase id). Purchases another visitor pushed live (tagged with their ref) are
 * skipped. Each purchase is inserted at most once per visitor, even with concurrent syncs.
 */
export async function syncFromNessie(db: Db, userId: string, opts: SyncOptions = {}): Promise<SyncResult> {
  const now = opts.now ?? new Date();
  const maxAge = opts.maxAgeMs ?? 0;
  const { customer, accounts } = await bankAccounts(maxAge > 0 ? BANK_TTL_MS : 0);
  const myRef = pushRef(userId);

  const lists: { account: NessieAccount; pl: PurchaseList }[] = [];
  let complete = true;
  for (const a of accounts) {
    try { lists.push({ account: a, pl: await accountPurchases(a._id, maxAge) }); } catch (e) {
      complete = false;
      if (e instanceof NessieError && e.status === 404) forgetNessieCache("bank"); // account replaced (seed --reset)
      console.warn(`[nessie] purchases for ${a._id} failed: ${(e as Error).message}`);
    }
  }
  const fetchedAt = lists.length ? Math.min(...lists.map((l) => l.pl.fetchedAt)) : now.getTime();

  const known = new Set((await many<{ external_id: string }>(db, "SELECT external_id FROM transactions WHERE user_id=$1 AND source='nessie'", [userId])).map((r) => r.external_id));
  const current = new Set<string>();
  const rows: NessieRow[] = [];
  let fetched = 0, hidden = 0;
  for (const { pl } of lists) {
    fetched += pl.list.length;
    for (const p of pl.list) {
      current.add(p._id);
      const { ref } = splitRef(p.description);
      if (ref && ref !== myRef) { hidden++; continue; }
      if (known.has(p._id) || p.status === "cancelled") continue;
      rows.push(await rowFor(p, now));
    }
  }

  const firstSync = !(await one(db, "SELECT 1 FROM bluff_meta WHERE key=$1", [metaKey(userId)]).catch(() => null));
  const { inserted, removed } = await withNessieLock(db, userId, async (c) => {
    if ((applied.get(userId) ?? 0) > fetchedAt) return { inserted: [] as { id: string; externalId: string }[], removed: 0 };
    const ins = await insertNessieRows(c, userId, rows);
    // Nessie is the source of truth for imported rows: purchases that no longer exist there (e.g. after a sandbox
    // reset) are removed locally. Only after a complete fetch, and only rows older than that fetch by a grace window:
    // a live push stamps its row before its Nessie POST, so a list read during the POST (or by merchantIdFor) is newer
    // than the row but doesn't have the purchase yet. Deleting it would lose its alert and 404 its txn link.
    let rm = 0;
    if (complete && lists.length) {
      const r = await c.query("DELETE FROM transactions WHERE user_id=$1 AND source='nessie' AND NOT (external_id = ANY($2::text[])) AND ts < $3::timestamptz - interval '10 minutes'", [userId, [...current], new Date(fetchedAt)]);
      rm = r.rowCount ?? 0;
    }
    if (applied.size > 50_000) applied.clear();
    applied.set(userId, fetchedAt);
    return { inserted: ins, removed: rm };
  });
  if (inserted.length || removed) await refreshMerchantDaily(db).catch(() => {});

  const card = accounts.find((a) => a.type === "Credit Card") ?? accounts[0];
  const checkedAt = new Date(fetchedAt).toISOString();
  // Only a complete sync marks the visitor as synced: after a partial first sync the next one is still a first sync, so
  // the history of the account that failed is imported as a starting point, not texted as "New charge".
  if (card && complete) await db.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
    [metaKey(userId), JSON.stringify({ name: `${customer.first_name} ${customer.last_name}`, nickname: `${card.nickname} ••${(card.account_number ?? "").slice(-4)}`, type: card.type, accountId: card._id, syncedAt: checkedAt })]).catch(() => {});

  const tsOf = new Map(rows.map((r) => [r.externalId, r.ts.getTime()]));
  const newTxns = [...inserted].sort((a, b) => (tsOf.get(b.externalId) ?? 0) - (tsOf.get(a.externalId) ?? 0))
    .map((r) => ({ id: r.id, ts: new Date(tsOf.get(r.externalId) ?? fetchedAt).toISOString() }));
  return {
    customer: { id: customer._id, name: `${customer.first_name} ${customer.last_name}` },
    accounts: accounts.map((a) => ({ id: a._id, type: a.type, nickname: a.nickname, last4: (a.account_number ?? "").slice(-4) })),
    fetched, inserted: inserted.length, removed, hidden, firstSync, checkedAt,
    newTxnIds: newTxns.map((r) => r.id), newTxns,
  };
}
