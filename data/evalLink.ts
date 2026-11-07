/** Claim B ground truth (synthetic). 20 charges with a true exposure + 10 with none; 10 dev / 20 test. */
export type EvalExposure = { key: string; label: string; daysAgo: number; legit?: boolean };
export type EvalCharge = {
  key: string; descriptor: string; amountCents: number;
  /** exposure key, or null = no true exposure */
  exposure: string | null;
  /** positives: days after the exposure. negatives: days before now. */
  day: number;
  split: "dev" | "test"; hard?: boolean; note?: string;
};

const SCAMMY: [string, number][] = [
  ["fastkicks-shop", 70], ["deliveryfix-help", 66], ["tollpay-tx", 62], ["glowskin-deals", 58], ["gadgetgalaxy-outlet", 55],
  ["luxwatch-sale", 52], ["petsupply-direct", 50], ["cheapflights-hub", 48], ["vitaboost-pro", 46], ["homedecor-mart", 44],
  ["streamflix-promo", 42], ["cryptoearn-now", 40], ["mobilefix-shop", 38], ["sunglass-outlet", 36], ["giftcard-zone", 34],
  ["bikeparts-depot", 32], ["toyland-express", 30], ["fitgear-pro", 28], ["kitchenwiz-store", 26], ["perfume-palace", 24],
];

export const EVAL_EXPOSURES: EvalExposure[] = [
  ...SCAMMY.map(([label, daysAgo]): EvalExposure => ({ key: label, label, daysAgo })),
  { key: "northloop-books", label: "northloop-books", daysAgo: 20, legit: true },
  { key: "bayou-bakery", label: "bayou-bakery", daysAgo: 18, legit: true },
];

const P = (key: string, descriptor: string, exposure: string, day: number, split: "dev" | "test", extra: Partial<EvalCharge> = {}): EvalCharge =>
  ({ key, descriptor, amountCents: 1500 + ((key.length * 977 + day * 131) % 9000), exposure, day, split, ...extra });
const N = (key: string, descriptor: string, daysAgo: number, split: "dev" | "test", note?: string): EvalCharge =>
  ({ key, descriptor, amountCents: 900 + ((key.length * 613 + daysAgo * 97) % 7000), exposure: null, day: daysAgo, split, note });

export const EVAL_CHARGES: EvalCharge[] = [
  P("p01", "FKSHP*LLC", "fastkicks-shop", 3, "dev", { hard: true, note: "abbreviated descriptor" }),
  P("p02", "DLVRYFX HELP", "deliveryfix-help", 5, "test", { note: "abbreviated descriptor" }),
  P("p03", "TOLLPAY*TX 0412", "tollpay-tx", 2, "dev"),
  P("p04", "GLOWSKIN DEALS", "glowskin-deals", 4, "dev"),
  P("p05", "SQ *GADGETGALAXY OUTLET", "gadgetgalaxy-outlet", 6, "test", { hard: true, note: "processor prefix" }),
  P("p06", "LUXWATCH SALE 8812", "luxwatch-sale", 1, "test"),
  P("p07", "PETSUPPLY DIRECT", "petsupply-direct", 9, "dev"),
  P("p08", "CHEAPFLIGHTS HUB", "cheapflights-hub", 12, "test"),
  P("p09", "VITABOOST*PRO LLC", "vitaboost-pro", 7, "dev"),
  P("p10", "PAYPAL *HOMEDECOR MART", "homedecor-mart", 5, "test", { hard: true, note: "processor prefix" }),
  P("p11", "STRMFLX PROMO", "streamflix-promo", 3, "test", { hard: true, note: "abbreviated descriptor" }),
  P("p12", "CRYPTOEARN NOW", "cryptoearn-now", 14, "test"),
  P("p13", "TST* MOBILEFIX SHOP", "mobilefix-shop", 2, "test", { hard: true, note: "processor prefix" }),
  P("p14", "SQ *SNGLSSOTLT", "sunglass-outlet", 4, "test", { hard: true, note: "prefix + abbreviation" }),
  P("p15", "GIFTCARD ZONE", "giftcard-zone", 20, "dev", { note: "late charge" }),
  P("p16", "BIKEPARTS DEPOT 77", "bikeparts-depot", 8, "dev"),
  P("p17", "TOYLAND EXPRESS", "toyland-express", 30, "test", { note: "late charge" }),
  P("p18", "FITGEAR PRO", "fitgear-pro", 10, "test"),
  P("p19", "KITCHENWIZ STORE", "kitchenwiz-store", 21, "test", { note: "late charge" }),
  P("p20", "PERFUME PALACE", "perfume-palace", 15, "test"),
  N("n01", "SHOP N SAVE", 60, "dev", "shares the word 'shop' with several exposures"),
  N("n02", "FAST LANE PARKING", 64, "test", "shares 'fast' with fastkicks-shop"),
  N("n03", "KICKS CAFE", 63, "test", "shares 'kicks' with fastkicks-shop"),
  N("n04", "PET SUPPLY WAREHOUSE", 49, "test", "similar to petsupply-direct but a different merchant"),
  N("n05", "GLOWSKIN DEALS", 70, "dev", "name matches but the charge is BEFORE the exposure"),
  N("n06", "GREENLEAF GROCER", 10, "test"),
  N("n07", "STREAMBOX.COM", 30, "test", "similar prefix to streamflix-promo"),
  N("n08", "CHEAP EATS DINER", 40, "test", "shares 'cheap' with cheapflights-hub"),
  N("n09", "HOME DEPOT 4412", 30, "dev", "shares 'home' with homedecor-mart"),
  N("n10", "TOLL ROAD AUTHORITY", 58, "test", "shares 'toll' with tollpay-tx"),
];
