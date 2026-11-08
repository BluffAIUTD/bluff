import { nessie, resolveCustomer, type NessieAccount, type NessieCustomer, type NessieMerchant, type NessiePurchase } from "./client";

/**
 * Process-wide cache of Nessie reads. Every visitor shares one Nessie customer, so while many visitors watch their card
 * the server still makes at most one purchases call per ~10 s. Concurrent callers share the in-flight request; a failed
 * request is never cached.
 */
export type Bank = { customer: NessieCustomer; accounts: NessieAccount[] };
export type PurchaseList = { list: NessiePurchase[]; /** when the request started (ms) */ fetchedAt: number };

type Entry<T> = { at: number; value: Promise<T> };
type State = { bank: Entry<Bank> | null; purchases: Map<string, Entry<PurchaseList>>; merchants: Map<string, { at: number; value: NessieMerchant | null }> };
const g = globalThis as unknown as { __bluffNessie?: State };
const state = (g.__bluffNessie ??= { bank: null, purchases: new Map(), merchants: new Map() });

/** Customer + accounts rarely change (a sandbox reset shows up as a 404, which drops this cache). */
export const BANK_TTL_MS = 15 * 60_000;
export const PURCHASES_TTL_MS = 10_000;
const MERCHANT_TTL_MS = 60 * 60_000;

function cached<T>(get: () => Entry<T> | null | undefined, set: (e: Entry<T> | null) => void, maxAgeMs: number, load: () => Promise<T>, now: number): Promise<T> {
  const hit = get();
  if (hit && now - hit.at <= maxAgeMs) return hit.value;
  const value = load();
  const entry = { at: now, value };
  set(entry);
  value.catch(() => { if (get() === entry) set(null); });
  return value;
}

/** The customer and their accounts (maxAgeMs 0 = always fetch). */
export function bankAccounts(maxAgeMs = BANK_TTL_MS, now = Date.now()): Promise<Bank> {
  return cached(() => state.bank, (e) => { state.bank = e; }, maxAgeMs, async () => {
    const customer = await resolveCustomer();
    if (!customer) throw new Error("No Nessie customer found. Run `npm run nessie:seed` first.");
    return { customer, accounts: await nessie.accounts(customer._id) };
  }, now);
}

/** All purchases on one account (maxAgeMs 0 = always fetch). */
export function accountPurchases(accountId: string, maxAgeMs = PURCHASES_TTL_MS, now = Date.now()): Promise<PurchaseList> {
  return cached(() => state.purchases.get(accountId), (e) => { if (e) state.purchases.set(accountId, e); else state.purchases.delete(accountId); }, maxAgeMs, async () => {
    const fetchedAt = Date.now();
    return { list: await nessie.purchases(accountId), fetchedAt };
  }, now);
}

/** A merchant by id (names don't change, so this is cached for an hour; misses for a minute). */
export async function merchantById(id: string, now = Date.now()): Promise<NessieMerchant | null> {
  const hit = state.merchants.get(id);
  if (hit && now - hit.at <= (hit.value ? MERCHANT_TTL_MS : 60_000)) return hit.value;
  const value = await nessie.merchant(id).catch(() => null);
  if (state.merchants.size > 2000) state.merchants.clear();
  state.merchants.set(id, { at: now, value });
  return value;
}

/** Drop cached reads (after a sandbox reset, a 404, or between tests). */
export function forgetNessieCache(what: "all" | "bank" | "purchases" = "all") {
  if (what === "all" || what === "bank") state.bank = null;
  if (what === "all" || what === "purchases") state.purchases.clear();
  if (what === "all") state.merchants.clear();
}
