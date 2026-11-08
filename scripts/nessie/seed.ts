/**
 * Writes the demo customer, a credit card account, merchants and purchases into the Capital One Nessie sandbox.
 * Idempotent: an account that already has purchases is left alone unless --reset is passed (replaces the account).
 *   npm run nessie:seed            npm run nessie:seed -- --reset
 */
import { DEMO_CUSTOMER, nessie, type NessieAccount, type NessieCustomer } from "../../lib/nessie/client";
import { NESSIE_SEED, purchaseDescription } from "../../data/nessieSeed";

const DAY = 86_400_000;
const ymd = (daysAgo: number) => new Date(Date.now() - daysAgo * DAY).toISOString().slice(0, 10);

async function main() {
  const reset = process.argv.includes("--reset");
  const customers = await nessie.customers();
  let customer: NessieCustomer | undefined = customers.find((c) => c.first_name === DEMO_CUSTOMER.first_name && c.last_name === DEMO_CUSTOMER.last_name);
  if (!customer) {
    customer = await nessie.createCustomer({ ...DEMO_CUSTOMER, address: { street_number: "800", street_name: "W Campbell Rd", city: "Richardson", state: "TX", zip: "75080" } });
    console.log(`created customer ${customer._id}`);
  } else console.log(`customer ${customer._id} exists`);

  let account: NessieAccount | undefined = (await nessie.accounts(customer._id)).find((a) => a.type === "Credit Card");
  if (account) {
    const existing = await nessie.purchases(account._id).catch(() => null);
    if (existing?.length && !reset) {
      console.log(`account ${account._id} already has ${existing.length} purchases; pass --reset to recreate it`);
      return;
    }
    // Nessie has no purchase delete, so a reset replaces the whole account.
    await nessie.deleteAccount(account._id);
    console.log(`deleted account ${account._id}`);
  }
  account = await nessie.createAccount(customer._id, { type: "Credit Card", nickname: "Quicksilver", rewards: 0, balance: 1200, account_number: "4417000012344417" });
  console.log(`created account ${account._id}`);

  const known = new Map((await nessie.merchants()).map((m) => [m.name, m]));
  let n = 0;
  for (const m of NESSIE_SEED) {
    const merchant = known.get(m.name) ?? await nessie.createMerchant({
      name: m.name, category: m.category,
      address: { street_number: m.street[0], street_name: m.street[1], city: m.kind === "real" ? "Dallas" : "Demo", state: "TX", zip: m.zip },
      geocode: { lat: 32.9857, lng: -96.7502 },
    });
    for (const p of m.purchases) {
      await nessie.createPurchase(account._id, { merchant_id: merchant._id, medium: "balance", purchase_date: ymd(p.daysAgo), amount: p.amount, status: "completed", description: purchaseDescription(m) });
      n++;
    }
  }
  console.log(`created ${NESSIE_SEED.length} merchants and ${n} purchases for ${customer.first_name} ${customer.last_name} (customer ${customer._id})`);
}

main().catch((e) => { console.error(e.message ?? e); process.exit(1); });
