/**
 * Demo purchases written into the Capital One Nessie sandbox by `npm run nessie:seed`.
 * - Real merchants point at their real websites.
 * - Legit "demo merchants" are real, public demo/practice shops (they allow crawling).
 * - Scam merchants are Bluff's own multi-page storefront websites, written "<slug>.demo" on the statement and mapped
 *   at sync time to wherever this deployment serves them (<slug>.<BASE_DOMAIN>). No real scam site is ever visited.
 * Each description carries the card descriptor and the website, like a real statement line.
 * Amounts are whole dollars: Nessie stores purchase amounts as integers (it truncates cents).
 */
export type NessieSeedMerchant = {
  key: string; name: string; website: string; category: string; descriptor: string; kind: "real" | "demo_shop" | "scam_demo";
  street: [string, string]; zip: string;
  purchases: { daysAgo: number; amount: number }[];
};

export const NESSIE_SEED: NessieSeedMerchant[] = [
  // Real merchants
  { key: "netflix", name: "Netflix", website: "netflix.com", category: "Entertainment", descriptor: "NETFLIX.COM", kind: "real", street: ["100", "Winchester Cir"], zip: "95032", purchases: [{ daysAgo: 33, amount: 15 }, { daysAgo: 3, amount: 15 }] },
  { key: "starbucks", name: "Starbucks", website: "starbucks.com", category: "Food", descriptor: "STARBUCKS STORE 08812", kind: "real", street: ["800", "W Campbell Rd"], zip: "75080", purchases: [{ daysAgo: 1, amount: 6 }, { daysAgo: 8, amount: 6 }, { daysAgo: 15, amount: 7 }] },
  { key: "target", name: "Target", website: "target.com", category: "Shopping", descriptor: "TARGET T-2318", kind: "real", street: ["1701", "N Central Expy"], zip: "75080", purchases: [{ daysAgo: 6, amount: 54 }] },
  { key: "uber", name: "Uber", website: "uber.com", category: "Transportation", descriptor: "UBER *TRIP", kind: "real", street: ["1725", "3rd St"], zip: "94158", purchases: [{ daysAgo: 2, amount: 18 }, { daysAgo: 12, amount: 23 }] },
  { key: "dart", name: "DART", website: "dart.org", category: "Transportation", descriptor: "DART GOPASS", kind: "real", street: ["1401", "Pacific Ave"], zip: "75202", purchases: [{ daysAgo: 9, amount: 6 }] },
  // Real public demo shops (legitimate sites built for demos and scraping practice)
  { key: "books", name: "Books to Scrape", website: "books.toscrape.com", category: "Shopping", descriptor: "BOOKSTOSCRAPE ORDER", kind: "demo_shop", street: ["1", "Demo Way"], zip: "75080", purchases: [{ daysAgo: 14, amount: 23 }] },
  { key: "scrapeme", name: "ScrapeMe", website: "scrapeme.live/shop", category: "Shopping", descriptor: "SCRAPEME LIVE", kind: "demo_shop", street: ["1", "Demo Way"], zip: "75080", purchases: [{ daysAgo: 11, amount: 45 }] },
  { key: "automation", name: "Automation Exercise", website: "automationexercise.com", category: "Shopping", descriptor: "AUTOMATIONEXERCISE.COM", kind: "demo_shop", street: ["1", "Demo Way"], zip: "75080", purchases: [{ daysAgo: 20, amount: 34 }] },
  { key: "webscraper", name: "Web Scraper Test Shop", website: "webscraper.io/test-sites/e-commerce/allinone", category: "Electronics", descriptor: "WEBSCRAPER TEST SHOP", kind: "demo_shop", street: ["1", "Demo Way"], zip: "75080", purchases: [{ daysAgo: 16, amount: 18 }] },
  // Bluff's scam-pattern storefront websites
  { key: "fastkicks", name: "FastKicks LLC", website: "fastkicks-shop.demo", category: "Shopping", descriptor: "FKSHP*LLC", kind: "scam_demo", street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 2, amount: 50 }] },
  { key: "deliveryfix", name: "DeliveryFix", website: "deliveryfix-help.demo", category: "Services", descriptor: "DLVRYFX HELP", kind: "scam_demo", street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 10, amount: 2 }, { daysAgo: 3, amount: 20 }] },
  { key: "tollpay", name: "TollPay TX", website: "tollpay-tx.demo", category: "Services", descriptor: "TOLLPAY*TX 0412", kind: "scam_demo", street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 7, amount: 12 }] },
  { key: "voltdeals", name: "VoltDeals Outlet", website: "voltdeals-outlet.demo", category: "Electronics", descriptor: "VOLTDEALS OUTLET", kind: "scam_demo", street: ["1600", "Commerce Blvd"], zip: "75201", purchases: [{ daysAgo: 5, amount: 189 }] },
  { key: "cinevault", name: "CineVault", website: "cinevault-trial.demo", category: "Entertainment", descriptor: "CINEVAULT*TRIAL", kind: "scam_demo", street: ["1", "Unknown"], zip: "00000", purchases: [{ daysAgo: 9, amount: 1 }, { daysAgo: 2, amount: 60 }] },
];

/** "NETFLIX.COM · netflix.com" */
export const purchaseDescription = (m: NessieSeedMerchant) => `${m.descriptor} · ${m.website}`;

/** POST /merchants body for a seed merchant (the seed script and the live push create merchants the same way). */
export const nessieMerchantBody = (m: NessieSeedMerchant) => ({
  name: m.name, category: m.category,
  address: { street_number: m.street[0], street_name: m.street[1], city: m.kind === "real" ? "Dallas" : "Demo", state: "TX", zip: m.zip },
  geocode: { lat: 32.9857, lng: -96.7502 },
});

/**
 * "Make a test purchase" on /scan: one tap posts a real purchase to the Nessie sandbox (scripts and the app share these).
 * Every preset is a merchant the seed already wrote to Nessie, so its statement line matches the seeded history.
 * `key` is what /scan?push=<key> preselects: the store slug for Bluff's own demo stores (the Chrome extension links
 * there), the seed key otherwise.
 */
export type LivePushPreset = { key: string; seedKey: string; group: "scam_demo" | "legit"; label: string; amount: number; note: string };

export const LIVE_PUSH_PRESETS: LivePushPreset[] = [
  { key: "voltdeals-outlet", seedKey: "voltdeals", group: "scam_demo", label: "VoltDeals Outlet", amount: 189, note: "Fake electronics clearance" },
  { key: "fastkicks-shop", seedKey: "fastkicks", group: "scam_demo", label: "FastKicks", amount: 50, note: "Sneaker brand clone" },
  { key: "cinevault-trial", seedKey: "cinevault", group: "scam_demo", label: "CineVault", amount: 60, note: "$1 trial that renews high" },
  { key: "deliveryfix-help", seedKey: "deliveryfix", group: "scam_demo", label: "DeliveryFix", amount: 2, note: "Small redelivery fee" },
  { key: "tollpay-tx", seedKey: "tollpay", group: "scam_demo", label: "TollPay TX", amount: 12, note: "Fake unpaid toll" },
  { key: "target", seedKey: "target", group: "legit", label: "Target", amount: 54, note: "Real retailer" },
  { key: "netflix", seedKey: "netflix", group: "legit", label: "Netflix", amount: 15, note: "Real subscription" },
  { key: "books", seedKey: "books", group: "legit", label: "Books to Scrape", amount: 23, note: "Public demo shop" },
  { key: "scrapeme", seedKey: "scrapeme", group: "legit", label: "ScrapeMe", amount: 45, note: "Public demo shop" },
];

/** A preset by its key, seed key or store slug ("voltdeals-outlet", "voltdeals"). */
export function livePushPreset(key: string | null | undefined): { preset: LivePushPreset; merchant: NessieSeedMerchant } | null {
  const k = (key ?? "").trim().toLowerCase();
  const preset = LIVE_PUSH_PRESETS.find((p) => p.key === k || p.seedKey === k);
  const merchant = preset && NESSIE_SEED.find((m) => m.key === preset.seedKey);
  return preset && merchant ? { preset, merchant } : null;
}
