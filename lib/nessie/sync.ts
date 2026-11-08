import type pg from "pg";
import { many } from "../db";
import { refreshMerchantDaily } from "../db/aggregate";
import { normalizeDescriptor } from "../linker/normalize";
import { websiteFromText } from "../scan/website";
import { nessie, resolveCustomer, type NessieAccount, type NessieCustomer, type NessieMerchant } from "./client";

export type SyncResult = {
  customer: { id: string; name: string };
  accounts: { id: string; type: string; nickname: string; last4: string }[];
  fetched: number; inserted: number; removed: number;
};

/** "NETFLIX.COM · netflix.com" → descriptor "NETFLIX.COM". Falls back to the merchant name. */
export function descriptorFrom(description: string | undefined, merchantName: string): string {
  const d = (description ?? "").split(" · ")[0].trim();
  return (d || merchantName || "UNKNOWN MERCHANT").slice(0, 120);
}

/**
 * Pull the customer's accounts and purchases from Capital One Nessie and upsert them into `transactions`
 * (source='nessie', external_id = Nessie purchase id). Never deletes anything.
 */
export async function syncFromNessie(db: pg.Pool | pg.PoolClient, userId: string): Promise<SyncResult> {
  const customer: NessieCustomer | null = await resolveCustomer();
  if (!customer) throw new Error("No Nessie customer found. Run `npm run nessie:seed` first.");
  const accounts: NessieAccount[] = await nessie.accounts(customer._id);
  const merchants = new Map<string, NessieMerchant | null>();
  const getMerchant = async (id: string) => {
    if (!merchants.has(id)) merchants.set(id, await nessie.merchant(id).catch(() => null));
    return merchants.get(id) ?? null;
  };

  const known = new Set((await many<{ external_id: string }>(db, "SELECT external_id FROM transactions WHERE user_id=$1 AND source='nessie'", [userId])).map((r) => r.external_id));
  let fetched = 0, inserted = 0, complete = true;
  const current = new Set<string>();
  for (const a of accounts) {
    const purchases = await nessie.purchases(a._id).catch((e) => { complete = false; console.warn(`[nessie] purchases for ${a._id} failed: ${(e as Error).message}`); return []; });
    for (const p of purchases) current.add(p._id);
    fetched += purchases.length;
    for (const p of purchases) {
      if (known.has(p._id) || p.status === "cancelled") continue;
      const m = await getMerchant(p.merchant_id);
      const merchantName = m?.name ?? "Unknown merchant";
      const descriptor = descriptorFrom(p.description, merchantName);
      const website = websiteFromText(p.description ?? "") ?? websiteFromText(merchantName);
      const category = (Array.isArray(m?.category) ? m?.category[0] : m?.category) ?? null;
      // Nessie dates are calendar days; pin to midday Central so the day never shifts in the UI.
      const ts = new Date(`${p.purchase_date}T18:00:00Z`);
      await db.query(
        `INSERT INTO transactions (ts, user_id, descriptor, descriptor_norm, amount_cents, mcc_category, is_recurring, source, external_id, merchant_name, website)
         VALUES ($1,$2,$3,$4,$5,$6,false,'nessie',$7,$8,$9)`,
        [ts, userId, descriptor, normalizeDescriptor(descriptor) || descriptor.toLowerCase(), Math.round(p.amount * 100), category?.toLowerCase() ?? null, p._id, merchantName, website],
      );
      known.add(p._id);
      inserted++;
    }
  }
  // Nessie is the source of truth for imported rows: purchases that no longer exist there (e.g. after a sandbox reset)
  // are removed locally. Only after a complete fetch, so a partial outage never deletes anything.
  let removed = 0;
  if (complete) {
    const r = await db.query("DELETE FROM transactions WHERE user_id=$1 AND source='nessie' AND NOT (external_id = ANY($2::text[]))", [userId, [...current]]);
    removed = r.rowCount ?? 0;
  }
  if (inserted || removed) await refreshMerchantDaily(db).catch(() => {});
  const card = accounts.find((a) => a.type === "Credit Card") ?? accounts[0];
  if (card) await db.query("INSERT INTO bluff_meta (key, value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value",
    [`nessie_account:${userId}`, JSON.stringify({ name: `${customer.first_name} ${customer.last_name}`, nickname: `${card.nickname} ••${(card.account_number ?? "").slice(-4)}`, type: card.type })]).catch(() => {});
  return {
    customer: { id: customer._id, name: `${customer.first_name} ${customer.last_name}` },
    accounts: accounts.map((a) => ({ id: a._id, type: a.type, nickname: a.nickname, last4: (a.account_number ?? "").slice(-4) })),
    fetched, inserted, removed,
  };
}
