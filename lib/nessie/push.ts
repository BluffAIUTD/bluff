import type { Db } from "../db";
import { one } from "../db";
import { refreshMerchantDaily } from "../db/aggregate";
import { TokenBucket } from "../ratelimit";
import { cardHold } from "../safesignal";
import { websiteFromText } from "../scan/website";
import { livePushPreset, nessieMerchantBody, purchaseDescription, type LivePushPreset, type NessieSeedMerchant } from "../../data/nessieSeed";
import { accountPurchases, bankAccounts, forgetNessieCache } from "./cache";
import { nessie, NessieError } from "./client";
import { chicagoDate, pushRef, splitRef, withRef } from "./ref";
import { insertNessieRows, withNessieLock } from "./rows";

/**
 * Live push ("Make a test purchase" on /scan): posts a real purchase to the Capital One Nessie sandbox card, then
 * mirrors it into the visitor's transactions straight from Nessie's answer, so the scan never waits on Nessie's
 * read-after-write. The purchase carries the visitor's ref, so only this visitor sees it.
 */
export const PUSH_MIN_DOLLARS = 1;
export const PUSH_MAX_DOLLARS = 999;

/** Nessie stores whole dollars (it truncates cents). */
export const clampDollars = (n: number) => Math.min(PUSH_MAX_DOLLARS, Math.max(PUSH_MIN_DOLLARS, Math.round(Number.isFinite(n) ? n : PUSH_MIN_DOLLARS)));

export const HOLD_MESSAGE = "Declined: your card is on a Safe Signal hold (simulated). Reply UNHOLD on your phone to release it.";

/** The card is on a Safe Signal hold: the purchase is declined before it reaches Nessie. */
export class CardHeldError extends Error {
  constructor(public since: string | null) { super("card_on_hold"); }
}

export type NessieCard = { customerId: string; accountId: string; name: string; nickname: string; last4: string };
const CARD_KEY = "nessie_card";
const merchantKey = (seedKey: string) => `nessie_merchant:${seedKey}`;

const putMeta = (db: Db, key: string, value: unknown) =>
  db.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value", [key, JSON.stringify(value)]);
async function getMeta<T>(db: Db, key: string): Promise<T | null> {
  const r = await one<{ value: string }>(db, "SELECT value FROM bluff_meta WHERE key=$1", [key]).catch(() => null);
  try { return r ? (JSON.parse(r.value) as T) : null; } catch { return null; }
}

/** The demo customer's credit card in Nessie, cached in bluff_meta so a push is a single Nessie call. */
export async function resolveCard(db: Db): Promise<NessieCard> {
  const hit = await getMeta<NessieCard>(db, CARD_KEY);
  if (hit?.accountId) return hit;
  const { customer, accounts } = await bankAccounts();
  const card = accounts.find((a) => a.type === "Credit Card") ?? accounts[0];
  if (!card) throw new NessieError(404, "The Nessie customer has no card account. Run `npm run nessie:seed`.");
  const c: NessieCard = { customerId: customer._id, accountId: card._id, name: `${customer.first_name} ${customer.last_name}`, nickname: card.nickname, last4: (card.account_number ?? "").slice(-4) };
  await putMeta(db, CARD_KEY, c).catch(() => {});
  return c;
}

/**
 * Nessie merchant id for a seed merchant: cached id → a purchase already on the card with the same statement line →
 * the global merchant list by name → create it (same shape as the seed).
 */
export async function merchantIdFor(db: Db, m: NessieSeedMerchant, accountId: string): Promise<string> {
  const hit = await getMeta<{ id: string }>(db, merchantKey(m.key));
  if (hit?.id) return hit.id;
  const line = purchaseDescription(m);
  const purchases = await accountPurchases(accountId).catch(() => null);
  let id = purchases?.list.find((p) => splitRef(p.description).text === line)?.merchant_id;
  if (!id) id = (await nessie.merchants()).find((x) => x.name === m.name)?._id;
  if (!id) id = (await nessie.createMerchant(nessieMerchantBody(m)))._id;
  await putMeta(db, merchantKey(m.key), { id }).catch(() => {});
  return id;
}

/** Drop cached Nessie ids (a 404 means the sandbox account or merchant was replaced). */
async function forgetIds(db: Db, seedKey: string) {
  await db.query("DELETE FROM bluff_meta WHERE key = ANY($1::text[])", [[CARD_KEY, merchantKey(seedKey)]]).catch(() => {});
  forgetNessieCache("bank");
  forgetNessieCache("purchases");
}

export type PushResult = {
  purchaseId: string; txnId: string; preset: string; merchant: string; amount: number;
  description: string; purchaseDate: string; website: string | null; card: { nickname: string; last4: string };
};

export async function pushPurchase(db: Db, userId: string, input: { preset: string; amount?: number }, now = new Date()): Promise<PushResult> {
  const found = livePushPreset(input.preset);
  if (!found) throw new Error(`unknown preset ${input.preset}`);
  const { preset, merchant }: { preset: LivePushPreset; merchant: NessieSeedMerchant } = found;

  // Safe Signal hold: declined here, before anything reaches Nessie. A failing hold check never blocks the demo.
  const hold = await cardHold(db, userId).catch((e) => { console.error("[push] hold check failed", (e as Error).message); return { held: false, since: null }; });
  if (hold.held) throw new CardHeldError(hold.since);

  const amount = clampDollars(input.amount ?? preset.amount);
  const purchaseDate = chicagoDate(now);
  const description = withRef(purchaseDescription(merchant), pushRef(userId));
  const post = async () => {
    const card = await resolveCard(db);
    const merchantId = await merchantIdFor(db, merchant, card.accountId);
    const created = await nessie.createPurchase(card.accountId, { merchant_id: merchantId, medium: "balance", purchase_date: purchaseDate, amount, status: "completed", description });
    if (!created?._id) throw new NessieError(502, "Nessie didn't return the new purchase id");
    return { card, created };
  };
  let r: Awaited<ReturnType<typeof post>>;
  try { r = await post(); } catch (e) {
    if (!(e instanceof NessieError && e.status === 404)) throw e;
    await forgetIds(db, merchant.key);
    r = await post();
  }

  const website = websiteFromText(purchaseDescription(merchant));
  const amountCents = Math.round((typeof r.created.amount === "number" ? r.created.amount : amount) * 100);
  const inserted = await withNessieLock(db, userId, (c) => insertNessieRows(c, userId, [{
    externalId: r.created._id, ts: now, descriptor: merchant.descriptor, amountCents,
    category: merchant.category.toLowerCase(), merchantName: merchant.name, website,
  }]));
  const txnId = inserted[0]?.id
    ?? (await one<{ id: string }>(db, "SELECT id FROM transactions WHERE user_id=$1 AND external_id=$2", [userId, r.created._id]))?.id;
  if (!txnId) throw new Error("the pushed purchase could not be saved locally");
  await refreshMerchantDaily(db).catch(() => {});
  return {
    purchaseId: r.created._id, txnId, preset: preset.key, merchant: merchant.name, amount: amountCents / 100,
    description, purchaseDate, website, card: { nickname: r.card.nickname, last4: r.card.last4 },
  };
}

// ---- limits: the sandbox key is shared by every visitor ---------------------------------------------------------------
type PushLimits = { user: TokenBucket; ip: TokenBucket; global: TokenBucket };
const g = globalThis as unknown as { __bluffPushLimits?: PushLimits };
const newLimits = (): PushLimits => ({
  user: new TokenBucket(6, 6 / 600_000),
  // Every cookieless request is a brand-new visitor, so the per-visitor bucket alone can't stop a script from emptying
  // the site-wide budget. One address gets at most a third of it (generous enough for a venue NAT full of judges).
  ip: new TokenBucket(20, 20 / 3_600_000),
  global: new TokenBucket(60, 60 / 3_600_000),
});
let limits = (g.__bluffPushLimits ??= newLimits());
if (!limits.ip) limits = g.__bluffPushLimits = newLimits(); // hot reload from the shape without the ip bucket

/**
 * 6 pushes per 10 minutes per visitor, 20 per hour per IP, ~60 per hour for the whole site. The unlocked presenter
 * skips the IP and site-wide buckets so a judge (or a script) can never make the stage demo say "busy".
 */
export function takePushToken(userId: string, opts: { ip?: string; presenter?: boolean } = {}): { ok: true } | { ok: false; retryAfterSec: number; scope: "user" | "global" } {
  const sec = (ms: number) => Math.max(1, Math.ceil(ms / 1000));
  const u = limits.user.take(userId);
  if (!u.ok) return { ok: false, retryAfterSec: sec(u.retryAfterMs), scope: "user" };
  if (opts.presenter) return { ok: true };
  if (opts.ip) {
    const i = limits.ip.take(opts.ip);
    if (!i.ok) return { ok: false, retryAfterSec: sec(i.retryAfterMs), scope: "user" };
  }
  const all = limits.global.take("all");
  if (!all.ok) return { ok: false, retryAfterSec: sec(all.retryAfterMs), scope: "global" };
  return { ok: true };
}

/** Tests only. */
export function resetPushLimits() { limits = g.__bluffPushLimits = newLimits(); }
