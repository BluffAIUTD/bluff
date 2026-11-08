/**
 * Demo purchases written into the Capital One Nessie sandbox by `npm run nessie:seed`.
 * Real merchants point at their real websites (scraped live by the scan). The scam-pattern stores use the reserved
 * `.example` TLD (RFC 2606), so they can never resolve to someone's real site; Bluff serves them from /stores.
 * Each purchase description carries the card descriptor and the website, like a real statement line.
 * Amounts are whole dollars: Nessie stores purchase amounts as integers (it truncates cents).
 */
export type NessieSeedMerchant = {
  key: string; name: string; website: string; category: string; descriptor: string; demo: boolean;
  street: [string, string]; zip: string;
  purchases: { daysAgo: number; amount: number }[];
};

export const NESSIE_SEED: NessieSeedMerchant[] = [
  { key: "netflix", name: "Netflix", website: "netflix.com", category: "Entertainment", descriptor: "NETFLIX.COM", demo: false, street: ["100", "Winchester Cir"], zip: "95032", purchases: [{ daysAgo: 33, amount: 15 }, { daysAgo: 3, amount: 15 }] },
  { key: "spotify", name: "Spotify", website: "spotify.com", category: "Entertainment", descriptor: "SPOTIFY USA", demo: false, street: ["4", "World Trade Center"], zip: "10007", purchases: [{ daysAgo: 27, amount: 12 }] },
  { key: "starbucks", name: "Starbucks", website: "starbucks.com", category: "Food", descriptor: "STARBUCKS STORE 08812", demo: false, street: ["800", "W Campbell Rd"], zip: "75080", purchases: [{ daysAgo: 1, amount: 6 }, { daysAgo: 8, amount: 6 }, { daysAgo: 15, amount: 7 }] },
  { key: "target", name: "Target", website: "target.com", category: "Shopping", descriptor: "TARGET T-2318", demo: false, street: ["1701", "N Central Expy"], zip: "75080", purchases: [{ daysAgo: 6, amount: 54 }] },
  { key: "chipotle", name: "Chipotle", website: "chipotle.com", category: "Food", descriptor: "CHIPOTLE 2091", demo: false, street: ["1301", "E Campbell Rd"], zip: "75080", purchases: [{ daysAgo: 4, amount: 13 }] },
  { key: "uber", name: "Uber", website: "uber.com", category: "Transportation", descriptor: "UBER *TRIP", demo: false, street: ["1725", "3rd St"], zip: "94158", purchases: [{ daysAgo: 2, amount: 18 }, { daysAgo: 12, amount: 23 }] },
  { key: "dart", name: "DART", website: "dart.org", category: "Transportation", descriptor: "DART GOPASS", demo: false, street: ["1401", "Pacific Ave"], zip: "75202", purchases: [{ daysAgo: 9, amount: 6 }] },
  { key: "whataburger", name: "Whataburger", website: "whataburger.com", category: "Food", descriptor: "WHATABURGER 1144", demo: false, street: ["2201", "N Central Expy"], zip: "75080", purchases: [{ daysAgo: 5, amount: 11 }] },
  { key: "walmart", name: "Walmart", website: "walmart.com", category: "Shopping", descriptor: "WALMART.COM 8009", demo: false, street: ["702", "SW 8th St"], zip: "72716", purchases: [{ daysAgo: 18, amount: 32 }] },
  // Scam-pattern demo storefronts (synthetic, labeled "Demo store, not real" on the page itself)
  { key: "fastkicks", name: "FastKicks LLC", website: "fastkicks-shop.example", category: "Shopping", descriptor: "FKSHP*LLC", demo: true, street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 2, amount: 50 }] },
  { key: "deliveryfix", name: "DeliveryFix", website: "deliveryfix-help.example", category: "Services", descriptor: "DLVRYFX HELP", demo: true, street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 10, amount: 2 }, { daysAgo: 3, amount: 20 }] },
  { key: "tollpay", name: "TollPay TX", website: "tollpay-tx.example", category: "Services", descriptor: "TOLLPAY*TX 0412", demo: true, street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 7, amount: 12 }] },
  // Small legit demo shops (show that unknown != scam)
  { key: "bayou", name: "Bayou Bakery", website: "bayou-bakery.example", category: "Food", descriptor: "SQ *BAYOU BAKERY", demo: true, street: ["310", "Main St"], zip: "75202", purchases: [{ daysAgo: 11, amount: 12 }] },
  { key: "northloop", name: "Northloop Books", website: "northloop-books.example", category: "Shopping", descriptor: "NORTHLOOP BOOKS", demo: true, street: ["44", "Elm St"], zip: "75201", purchases: [{ daysAgo: 14, amount: 24 }] },
];

/** "NETFLIX.COM · netflix.com" */
export const purchaseDescription = (m: NessieSeedMerchant) => `${m.descriptor} · ${m.website}`;
