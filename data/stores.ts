/** Demo storefronts. Scam ones are full multi-page websites (scripts/stores/build-sites.mjs) served at <slug>.<BASE_DOMAIN>. Ages are relative to the seed date. */
export type Store = {
  slug: string; name: string; scam: boolean; ageDays: number; registrar: string; brandCloneOf: string | null;
  tagline: string; category: string;
};

export const STORES: Store[] = [
  { slug: "fastkicks-shop", name: "FastKicks", scam: true, ageDays: 4, registrar: "NameBargain Ltd", brandCloneOf: "a major sneaker brand", tagline: "Retro Runner 85% OFF — today only", category: "fake_store" },
  { slug: "deliveryfix-help", name: "DeliveryFix", scam: true, ageDays: 6, registrar: "NameBargain Ltd", brandCloneOf: "a national postal service", tagline: "Pay a small fee to reschedule your parcel", category: "delivery_fee" },
  { slug: "tollpay-tx", name: "TollPay TX", scam: true, ageDays: 9, registrar: "QuickReg Inc", brandCloneOf: "a state toll authority", tagline: "Settle your unpaid toll balance", category: "toll_scam" },
  { slug: "voltdeals-outlet", name: "VoltDeals Outlet", scam: true, ageDays: 21, registrar: "QuickReg Inc", brandCloneOf: null, tagline: "Electronics clearance: the traps are on the inner pages", category: "fake_store" },
  { slug: "cinevault-trial", name: "CineVault", scam: true, ageDays: 45, registrar: "NameBargain Ltd", brandCloneOf: null, tagline: "$1 trial that renews at $59.99/month", category: "subscription_trap" },
  { slug: "bayou-bakery", name: "Bayou Bakery", scam: false, ageDays: 2190, registrar: "Established Registrar", brandCloneOf: null, tagline: "Fresh pastries, pickup in 20 minutes", category: "legit_store" },
  { slug: "northloop-books", name: "Northloop Books", scam: false, ageDays: 3100, registrar: "Established Registrar", brandCloneOf: null, tagline: "Independent bookshop since 2009", category: "legit_store" },
  { slug: "campus-tech", name: "Campus Tech", scam: false, ageDays: 1800, registrar: "Established Registrar", brandCloneOf: null, tagline: "Cables, chargers and student discounts", category: "legit_store" },
  { slug: "lonestar-tickets", name: "Lonestar Tickets", scam: false, ageDays: 2600, registrar: "Established Registrar", brandCloneOf: null, tagline: "Concerts and games near you", category: "legit_store" },
  { slug: "greenleaf-grocer", name: "Greenleaf Grocer", scam: false, ageDays: 4200, registrar: "Established Registrar", brandCloneOf: null, tagline: "Local groceries delivered", category: "legit_store" },
];

/** Scripted charges posted by the demo trigger (never part of the seeded history). */
export type Script = { id: string; storeSlug: string | null; descriptor: string; amountCents: number; mcc: string; recurring?: boolean; note: string };

export const SCRIPTS: Script[] = [
  { id: "txn_demo_link_1", storeSlug: "fastkicks-shop", descriptor: "FKSHP*LLC", amountCents: 4999, mcc: "apparel", note: "Signature charge: abbreviated descriptor of the sneaker clone" },
  { id: "txn_demo_link_2", storeSlug: "deliveryfix-help", descriptor: "DLVRYFX HELP", amountCents: 1999, mcc: "services", note: "Redelivery fee that never ends" },
  { id: "txn_demo_link_3", storeSlug: "tollpay-tx", descriptor: "TOLLPAY*TX 0412", amountCents: 1240, mcc: "services", note: "Fake toll balance" },
  { id: "txn_demo_legit_1", storeSlug: "bayou-bakery", descriptor: "SQ *BAYOU BAKERY", amountCents: 1250, mcc: "food", note: "Expected charge" },
  { id: "txn_demo_legit_2", storeSlug: "northloop-books", descriptor: "NORTHLOOP BOOKS", amountCents: 2350, mcc: "books", note: "Expected charge" },
  { id: "txn_demo_legit_3", storeSlug: "campus-tech", descriptor: "PAYPAL *CAMPUSTECH", amountCents: 1299, mcc: "electronics", note: "Expected charge" },
  { id: "txn_demo_legit_4", storeSlug: "lonestar-tickets", descriptor: "LONESTAR TICKETS", amountCents: 9800, mcc: "entertainment", note: "Expected charge" },
  { id: "txn_demo_legit_5", storeSlug: "greenleaf-grocer", descriptor: "GREENLEAF GROCER 221", amountCents: 4210, mcc: "grocery", note: "Expected charge" },
  { id: "txn_demo_drift", storeSlug: null, descriptor: "STREAMBOX.COM", amountCents: 3198, mcc: "streaming", recurring: true, note: "Streaming service at 2x its usual price" },
];

export const ALLOWLIST_HOSTS = [
  "amazon.com", "walmart.com", "target.com", "bestbuy.com", "costco.com", "homedepot.com", "lowes.com", "apple.com", "microsoft.com",
  "google.com", "ebay.com", "etsy.com", "kroger.com", "walgreens.com", "cvs.com", "macys.com", "nordstrom.com", "kohls.com", "wayfair.com",
  "nike.com", "adidas.com", "ikea.com", "newegg.com", "staples.com", "paypal.com", "stripe.com", "squareup.com", "chase.com", "bankofamerica.com",
  "wellsfargo.com", "capitalone.com", "citi.com", "discover.com", "americanexpress.com", "usbank.com", "pnc.com", "usps.com", "ups.com", "fedex.com",
  "netflix.com", "spotify.com", "uber.com", "lyft.com", "doordash.com", "instacart.com", "t-mobile.com", "att.com", "verizon.com", "irs.gov", "ssa.gov",
];

/** Stores built as multi-page websites (crawled over HTTP by the bank scan). */
export const SITE_SLUGS = ["fastkicks-shop", "deliveryfix-help", "tollpay-tx", "voltdeals-outlet", "cinevault-trial"] as const;
