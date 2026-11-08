/**
 * Generate the Bluff synthetic scam/legit message dataset with NVIDIA Nemotron.
 *
 *   npx tsx --env-file=.env scripts/data/gen_messages.ts                 # full run, writes data/messages/bluff-messages.jsonl
 *   npx tsx --env-file=.env scripts/data/gen_messages.ts --only toll_scam,legit_otp
 *        regenerate just those categories; every other category is kept from the existing file
 *   npx tsx scripts/data/gen_messages.ts --validate                      # re-validate the existing file and print the report
 *   npx tsx scripts/data/gen_messages.ts --drop bm-0012,bm-0140          # remove hand-reviewed bad records (re-ids the file)
 *
 * Synthetic, self-made data. Every brand, domain, phone number and person is fictional. NOT T-Mobile data.
 */
import fs from "node:fs";
import path from "node:path";
import { chat } from "../../lib/agent/llm";
import { getConfig } from "../../lib/config";

const OUT = path.join(process.cwd(), "data/messages/bluff-messages.jsonl");
const SOURCE = "bluff-synthetic-v1";
const BATCH = 8;
const CONCURRENCY = 3;

type Label = "scam" | "legit";
type Difficulty = "easy" | "medium" | "hard";
type Channel = "sms" | "email" | "imessage";
type Flag = { span: string; why: string };
type Rec = {
  id: string; channel: Channel; sender: string; subject: string | null; text: string;
  label: Label; category: string; difficulty: Difficulty; red_flags: Flag[]; why_legit?: string; source: string;
};
type Cat = { id: string; label: Label; target: number; brands: string[]; brief: string; channels: string; hard: string };

// ---------------------------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------------------------
const BRANDS = {
  delivery: ["Parcelo", "ShipRight", "Swiftbox", "Courierly"],
  toll: ["TollTag", "RoadPass", "Metro Tollway Authority", "Lone Prairie Tollway", "Bayline Express Lanes"],
  bank: ["Northbank", "Harborline Bank", "Lakeview Credit Union", "Cedar Trust", "Summit Federal Credit Union"],
  pay: ["MeadowPay", "Zippit", "PocketSend", "Ferro Wallet"],
  shop: ["ShopLane", "Brightcart", "Oakmart", "Kettle & Co", "Pinecrest Outfitters", "Lumen Electronics"],
  stream: ["StreamBox", "Flixy", "Tunewave", "Mailbloom (email)"],
  carrier: ["Signalwave Mobile", "Brightline Wireless"],
  tech: ["Corelink", "Bytewise Security", "ShieldNet Antivirus", "CloudVault"],
  crypto: ["CoinNest", "Apexa Trade", "Lumora Exchange"],
  gov: ["Westland State Tax Office", "Lakemont County Court", "Federal Benefits Bureau", "Westland Motor Vehicle Office"],
  jobs: ["Talentry", "Hirewell Staffing", "Northstar Remote"],
  rental: ["Nestly Rentals", "Keyway Homes", "StayHaven"],
  market: ["Swapspot Marketplace", "Listly", "TradeCorner"],
  health: ["Greenleaf Pharmacy", "Riverside Family Clinic", "Brightsmile Dental", "Pawsome Vet Care", "QuickLube Auto Service", "Studio Nine Salon"],
  food: ["Basil & Bowl", "Crumb Bakery", "Taco Junction"],
};
const B = BRANDS;
const S = (id: string, brands: string[], channels: string, brief: string, hard: string): Cat => ({ id, label: "scam", target: 10, brands, channels, brief, hard });
const L = (id: string, brands: string[], channels: string, brief: string, hard: string): Cat => ({ id, label: "legit", target: 17, brands, channels, brief, hard });

const CATS: Cat[] = [
  S("delivery_fee", B.delivery, "mostly sms", "Fake parcel carrier says a package is held / address incomplete and a small redelivery or customs fee must be paid via a link.",
    "polite, no typos, tiny fee like $0.99-$2.50, lookalike domain such as parcelo-redelivery.info"),
  S("toll_scam", B.toll, "sms", "Fake toll authority says there is an unpaid toll balance plus a late fee that must be paid through a link today or face penalties.",
    "calm tone, small exact amount ($3.75), lookalike domain like tolltag-billing.info, no threats in caps"),
  S("bank_impersonation", [...B.bank, ...B.pay], "sms or email", "Pretends to be the recipient's bank fraud team about a suspicious charge and asks them to verify card/login details via a link, by replying, or by calling a number.",
    "no link at all: asks you to reply YES/NO and then says a specialist will call, or asks you to call a 555-01xx number; or asks for the code that was just texted"),
  S("account_suspension", [...B.stream, ...B.carrier, ...B.shop], "sms or email", "Says a streaming, email, phone-carrier or shopping account will be suspended / was locked and billing must be updated via a link.",
    "polite and well-formatted, plausible lookalike domain (streambox-billing.help), no shouting"),
  S("prize_giveaway", [...B.shop, ...B.carrier, ...B.food], "sms, email or imessage", "Congratulates the recipient on winning a prize, raffle, loyalty reward or survey gift; claim requires a link, a small shipping fee, or personal details.",
    "modest 'loyalty thank-you' reward, asks only for a small shipping fee or a short survey with card details"),
  S("gift_card_request", B.shop, "sms, email or imessage", "Someone posing as a boss, coworker, pastor or relative asks the recipient to buy gift cards (fictional store brands like the ones listed) and send the codes, quietly.",
    "polite boss/pastor message with no link, 'are you free? I need a quick favor', buy cards for 'client gifts' and text photos of the codes"),
  S("investment_crypto", B.crypto, "sms, imessage or email", "Promotes a crypto / trading / 'AI trading bot' opportunity with guaranteed returns, a mentor or a VIP group, often after a 'wrong number' opener.",
    "friendly 'sorry, wrong number' or old-acquaintance opener that drifts into a mentor's investing app; no link"),
  S("tech_support", B.tech, "email or sms", "Fake tech support / antivirus renewal / computer-infected alert telling the recipient to call a support number or install remote-access software.",
    "professional invoice-style or security-notice email with only a 555-01xx phone number, no link"),
  S("job_offer", [...B.jobs, ...B.shop], "sms, imessage or email", "Unsolicited remote job offer with high pay for easy tasks (liking products, reviews, reshipping); asks to message a recruiter elsewhere or pay a training/equipment fee.",
    "professional recruiter tone, plausible pay, asks to continue on a private chat app or to deposit a check and buy equipment from 'our vendor'"),
  S("romance", B.pay, "imessage or sms", "Romance / befriending scam: affectionate message from someone met online (dating app, game, social site - all unnamed or fictional) or never met in person. EVERY message must contain a concrete risky ask: send money for a flight/visa/customs fee/medical bill, buy a gift card, invest in their 'uncle's trading app', or move to a private chat app. A friendly hello with no ask is NOT acceptable.",
    "warm, patient message, money ask is soft ('I hate to ask...'), maybe via MeadowPay or a gift card"),
  S("family_emergency", B.pay, "sms or imessage", "'Hi Mom/Dad, this is my new number' or grandchild-in-trouble message asking for an urgent money transfer, bail, or a bill payment, and to keep it secret.",
    "'Hi Mum, I dropped my phone, this is my new number, save it' plus a quiet request to pay a bill for them today"),
  S("subscription_trap", [...B.tech, ...B.stream], "email or sms", "Fake renewal/invoice for a subscription the recipient never bought (antivirus, streaming, software) for a large amount; 'call to cancel or get a refund'.",
    "realistic invoice with order number and amount, only a 1-800-555-01xx number to dispute it, no link"),
  S("refund_overpayment", [...B.pay, ...B.bank, ...B.shop], "sms or email", "Claims the recipient was overpaid or is owed a refund; asks them to send back the 'extra' money or enter bank details to receive the refund.",
    "polite stranger: 'I sent you $300 on MeadowPay by mistake, could you please send it back?' with no link"),
  S("fake_store", ["invent a store name like Luxe Outlet Hub, Urban Threads Clearance, GadgetVault Deals"], "sms, email or imessage", "Online store advertising an unbelievable sale (70-90% off designer bags, sneakers, electronics), a 'warehouse closing' liquidation, or a store that only takes prepayment by gift card, crypto or wire. It is a SALE/SHOP message, not an account, toll, tax or bank message.",
    "polished store email with a plausible shop domain (luxeoutlethub.shop), discount just a bit too good (65% off), 'pay by bank transfer for extra 10% off'"),
  S("verification_code_theft", [...B.market, ...B.pay], "sms or imessage", "Asks the recipient to read back or forward a verification / 2FA code they just received ('I sent my code to your number by mistake', 'support needs the code to stop the fraud', a marketplace buyer verifying you are real).",
    "friendly marketplace buyer: 'before I drive over, I'll send a code to make sure you're not a bot, just text it back'"),
  S("government_impersonation", B.gov, "sms or email", "Impersonates a FICTIONAL government office (tax office, benefits bureau, court, motor vehicle office) about back taxes, a warrant, a benefit payment or a fine, demanding prompt payment or personal info.",
    "formal notice with a case number, asks you to call a 555-01xx line to 'resolve' it, no link"),
  S("rental_deposit", [...B.rental, ...B.pay], "email, sms or imessage", "Fake landlord / rental listing asks for a deposit or application fee before a viewing (landlord 'out of the country'), or a vacation rental asking to pay off-platform.",
    "friendly landlord, reasonable rent, wants deposit by MeadowPay before showing because 'many people are interested'"),

  L("legit_transactional", [...B.shop, ...B.food, "Greenleaf Pharmacy"], "sms or email", "Real order confirmation, receipt, pickup-ready or refund-processed message from a store, pharmacy or restaurant. Contains an order number; asks for nothing.",
    "refund or charge notice with an amount, or 'pickup by 7 PM today or the order is returned to stock' - but no request for info and no login link"),
  L("legit_delivery", [...B.delivery, ...B.shop], "sms or email", "Real package tracking update from a carrier or store: shipped, out for delivery, delivered, delayed, or delivery attempted. Never asks for a fee or personal details.",
    "'delivery attempted, we will try again tomorrow, no action needed' or 'signature required', with a <brand>.example tracking link"),
  L("legit_otp", [...B.bank, ...B.pay, ...B.shop, ...B.stream, ...B.carrier], "sms", "Real automated one-time passcode text sent BY A COMPANY (never by a person): gives a 4-8 digit code, says it expires, and explicitly says never share it / staff will never ask for it. Sender is a 5-digit short code or no-reply@<brand>.example.",
    "'Code 482913 expires in 10 minutes. If you didn't request it, someone may be trying to sign in - do not share it and change your password in the app'"),
  L("legit_bank_alert", [...B.bank, ...B.pay], "sms or email", "Real bank or card purchase / balance / deposit alert from a bank or payment app. If something looks wrong it says to call the number on the back of your card or check the official app. No login link, never asks for a PIN or code.",
    "'FRAUD ALERT: Did you attempt $482.10 at Lumen Electronics? Reply YES or NO.' or 'We paused your card; call the number on the back of your card'"),
  L("legit_appointment", B.health, "sms or email", "Real appointment reminder (dentist, clinic, salon, car service, vet): date/time, reply C to confirm or call the office.",
    "'Action required: confirm by 5 PM today or your slot will be released. Reply C to confirm'"),
  L("legit_marketing", [...B.shop, ...B.food, ...B.carrier, ...B.stream], "sms or email", "Real promotional message from a store/brand the person shops at: normal discount (10-40% off, BOGO), promo code, end date, 'Reply STOP to unsubscribe' or an unsubscribe line.",
    "'LAST CHANCE: 40% off ends at midnight!' with a <brand>.example link, or 'you have $10 in rewards, use it in the app before Sunday'"),
  L("legit_personal", [], "imessage or sms", "Normal chat between people who know each other: friend, sibling, parent, coworker or neighbor making plans, running late, sharing news, asking a casual question. NOT from a company. Ordinary first names only.",
    "sounds urgent but is real and asks for nothing risky: 'call me when you can, it's about Grandma's birthday dinner', or a roommate reminding you of rent you both agreed on"),
  L("legit_account_notice", [...B.stream, ...B.pay, ...B.carrier, ...B.shop], "email or sms", "Real security notice: password changed, new sign-in from a device, email or phone number updated. Says if this wasn't you, open the official app or settings yourself; contains no login link to click.",
    "'Security alert: new sign-in from Phoenix, AZ on a new laptop. If this wasn't you, open the app > Settings > Security' - alarming but asks for nothing"),
];

const NAMES = ["Maya", "Jordan", "Priya", "Luis", "Aisha", "Ben", "Carmen", "Devon", "Elena", "Femi", "Grace", "Hector", "Ivy", "Jamal", "Kim", "Leo", "Nina", "Omar", "Rosa", "Sam", "Tara", "Victor", "Wes", "Yuki", "Zoe"];

// ---------------------------------------------------------------------------------------------
// Validation rules
// ---------------------------------------------------------------------------------------------
// Case-insensitive real brands / agencies / apps (extends REAL_BRANDS in lib/gamegen.ts).
const REAL_BRANDS_I = /\b(amazon|paypal|google|microsoft|netflix|walmart|usps|fedex|dhl|wells fargo|bank of america|citibank|citigroup|t-?mobile|verizon|at&t|sprint|venmo|zelle|cash ?app|facebook|instagram|whatsapp|telegram|tiktok|snapchat|twitter|linkedin|irs|internal revenue|ebay|nike|adidas|spotify|hulu|disney|costco|best buy|home depot|lowe'?s|kroger|cvs|walgreens|uber|lyft|doordash|grubhub|instacart|airbnb|vrbo|zillow|craigslist|indeed|coinbase|binance|robinhood|kraken|capital one|american express|amex|mastercard|discover card|geico|state farm|allstate|social security|medicare|medicaid|fbi|ftc|fema|uscis|homeland security|e-?z ?pass|sunpass|txtag|fastrak|peach pass|ntta|mcafee|norton|geek squad|windows defender|itunes|icloud|iphone|imessage|google play|xbox|playstation|roblox|steam|gmail|yahoo|hotmail|outlook\.com|shein|temu|etsy|shopify|stripe|square cash|western union|moneygram|bitcoin atm|tesla|elon|musk|bezos|taylor swift|oprah|mrbeast|trump|biden|obama|starbucks|mcdonald'?s|chick-fil-a|chipotle|dominos|domino'?s|kaiser|aetna|cigna|humana|blue cross|unitedhealth|delta|united airlines|american airlines|southwest|marriott|hilton|expedia|booking\.com)\b/i;
// Ambiguous English words: only a brand when capitalized as one.
const REAL_BRANDS_CS = /\b(Apple|Target|Chase|UPS|Visa|Citi|Discover|Progressive|Signal app|Prime|Kohl's|Macy's|Sephora|Ulta|Wayfair|Dell|HP|Samsung|Xfinity|Comcast|Spectrum|Cox|Optimum|Ally|Chime|SoFi|Navy Federal|USAA|PNC|TD Bank|Truist|Regions|Fifth Third|Huntington|KeyBank|Synchrony|Klarna|Afterpay|Affirm|Etsy|Lyft|Toyota|Honda|Ford|DMV)\b/;
const RISKY_TLDS = new Set(["top", "xyz", "help", "click", "live", "info", "cc", "icu", "shop", "online", "site", "support", "vip", "buzz", "link", "store", "club", "life", "work", "rest", "cyou", "sbs", "cfd", "bond"]);
const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))\b/gi;
const PHONE_RE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const OK_PHONE = /555[\s.-]?01\d\d$/;

type Raw = Record<string, unknown>;
type Drop = { reason: string; category: string; text?: string };

function domainsIn(s: string): { host: string; tld: string }[] {
  const out: { host: string; tld: string }[] = [];
  for (const m of s.matchAll(DOMAIN_RE)) {
    const host = m[1].toLowerCase();
    const tld = m[2].toLowerCase();
    // Ignore things like "a.m.", "p.m.", "e.g", "St.Louis" by requiring an alphabetic second-level label of 2+ chars.
    const labels = host.split(".");
    if (labels.length < 2 || labels[labels.length - 2].length < 2) continue;
    if (/^\d+$/.test(labels[0])) continue;
    out.push({ host, tld });
  }
  return out;
}

/** Returns a reason string if the record breaks a content rule, else null. */
function contentProblem(r: Pick<Rec, "label" | "sender" | "subject" | "text" | "channel">): string | null {
  const all = [r.sender, r.subject ?? "", r.text].join("\n");
  const brand = all.match(REAL_BRANDS_I) ?? all.match(REAL_BRANDS_CS);
  if (brand) return `real_brand:${brand[0]}`;
  if (/\b(best ?buy|bestbuy|e-?zpass|home ?depot)\b/i.test(all)) return "real_brand";
  for (const m of all.matchAll(PHONE_RE)) if (!OK_PHONE.test(m[0].replace(/\D+$/, ""))) return `bad_phone:${m[0]}`;
  for (const d of domainsIn(all)) {
    if (r.label === "legit" && d.tld !== "example") return `legit_domain:${d.host}`;
    if (r.label === "legit" && /verify|secure|login|signin|claim|alert|update|unlock/.test(d.host)) return `legit_lookalike_domain:${d.host}`;
    if (r.label === "scam" && !RISKY_TLDS.has(d.tld)) return `scam_domain_tld:${d.host}`;
  }
  return null;
}

const CHANNELS = new Set(["sms", "email", "imessage"]);
const DIFFS = new Set(["easy", "medium", "hard"]);

function str(v: unknown): string { return typeof v === "string" ? v.trim() : ""; }

/** Normalize and validate one model item. Returns a record (without id) or a drop reason. */
function validate(o: Raw, cat: Cat): Omit<Rec, "id"> | Drop {
  const drop = (reason: string): Drop => ({ reason, category: cat.id, text: str(o.text).slice(0, 80) });
  // Undo model "defanging" (hxxp://) and <angle-bracketed> links; collapse trailing spaces before newlines.
  const clean = (t: string) => t.replace(/\bhxxps?:\/\//gi, "https://").replace(/<((?:https?:\/\/)?[a-z0-9.-]+\.[a-z]{2,}[^>\s]*)>/gi, "$1").replace(/[ \t]+\n/g, "\n");
  const text = clean(str(o.text));
  if (/\[[^\]]*\]|\{\{|\bfake|\bredacted\b|\bplaceholder\b|\bexample\.com\b|\blorem\b/i.test(text)) return drop("placeholder");
  let channel = str(o.channel).toLowerCase().replace(/[^a-z]/g, "") as Channel;
  if (channel === ("text" as Channel)) channel = "sms";
  if (!CHANNELS.has(channel)) return drop("bad_channel");
  const sender = clean(str(o.sender) || str(o.from));
  if (!sender) return drop("no_sender");
  let subject: string | null = str(o.subject) || null;
  if (channel !== "email") subject = null;
  if (text.length < 40 || text.length > 320) return drop("length");
  let difficulty = str(o.difficulty).toLowerCase() as Difficulty;
  if (!DIFFS.has(difficulty)) difficulty = "medium";
  if (channel === "email" && !sender.includes("@")) return drop("email_sender_not_address");
  const prob = contentProblem({ label: cat.label, sender, subject, text, channel });
  if (prob) return drop(prob);

  const base = { channel, sender, subject, text, label: cat.label, category: cat.id, difficulty, source: SOURCE };
  if (cat.label === "legit") {
    let why = str(o.why_legit);
    if (why.length > 120) why = why.slice(0, 117).replace(/\s+\S*$/, "") + "...";
    return { ...base, red_flags: [], ...(why ? { why_legit: why } : {}) };
  }
  const rawFlags = Array.isArray(o.red_flags) ? (o.red_flags as Raw[]) : [];
  const flags: Flag[] = [];
  for (const f of rawFlags) {
    let span = str(f?.span).replace(/^["'“‘]+|["'”’]+$/g, "");
    let why = str(f?.why);
    if (!span || !why) continue;
    if (!text.includes(span)) {
      // Repair a case-only mismatch by taking the exact substring from the text.
      const i = text.toLowerCase().indexOf(span.toLowerCase());
      if (i < 0) continue;
      span = text.slice(i, i + span.length);
    }
    if (span.length < 3 || span.length > 60) continue;
    if (flags.some((x) => x.span === span)) continue;
    if (why.length > 90) why = why.slice(0, 87).replace(/\s+\S*$/, "") + "...";
    flags.push({ span, why });
    if (flags.length === 3) break;
  }
  if (flags.length < 1) return drop("no_valid_red_flag_span");
  return { ...base, red_flags: flags };
}

function isDrop(x: unknown): x is Drop { return !!x && typeof x === "object" && "reason" in x; }

// ---------------------------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------------------------
function norm(t: string) { return t.toLowerCase().replace(/\d/g, "0").replace(/[^a-z0 ]+/g, " ").replace(/\s+/g, " ").trim(); }
function tokens(t: string) { return new Set(norm(t).split(" ").filter((w) => w.length > 2)); }
function jaccard(a: Set<string>, b: Set<string>) { let i = 0; for (const x of a) if (b.has(x)) i++; return i / (a.size + b.size - i || 1); }

function dedupe<T extends { text: string; category: string }>(items: T[], drops: Drop[]): T[] {
  const seen = new Set<string>();
  const kept: { item: T; tok: Set<string> }[] = [];
  for (const it of items) {
    const n = norm(it.text);
    if (seen.has(n)) { drops.push({ reason: "duplicate_exact", category: it.category, text: it.text.slice(0, 80) }); continue; }
    const tok = tokens(it.text);
    if (kept.some((k) => jaccard(k.tok, tok) >= 0.8)) { drops.push({ reason: "duplicate_near", category: it.category, text: it.text.slice(0, 80) }); continue; }
    seen.add(n); kept.push({ item: it, tok });
  }
  return kept.map((k) => k.item);
}

// ---------------------------------------------------------------------------------------------
// Model calls
// ---------------------------------------------------------------------------------------------
function parseItems(content: string): Raw[] | null {
  let t = content.trim().replace(/^```(?:json|JSON)?\s*/, "").replace(/\s*```\s*$/, "");
  const tryParse = (s: string): unknown => { try { return JSON.parse(s); } catch { return undefined; } };
  let v = tryParse(t);
  if (v === undefined) {
    const objStart = t.indexOf("{"), arrStart = t.indexOf("[");
    const useArr = arrStart >= 0 && (objStart < 0 || arrStart < objStart);
    const s = useArr ? arrStart : objStart, e = useArr ? t.lastIndexOf("]") : t.lastIndexOf("}");
    if (s >= 0 && e > s) { t = t.slice(s, e + 1); v = tryParse(t); }
  }
  if (Array.isArray(v)) return v as Raw[];
  if (v && typeof v === "object") {
    const o = v as Raw;
    for (const k of ["messages", "items", "data", "results"]) if (Array.isArray(o[k])) return o[k] as Raw[];
    const arr = Object.values(o).find(Array.isArray);
    if (arr) return arr as Raw[];
    if (typeof o.text === "string") return [o];
  }
  return null;
}

/** Parse the first balanced {...} object in a string (ignores fences and trailing chatter). */
function firstJsonObject(t: string): unknown {
  const start = t.indexOf("{");
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; } }
  }
  return null;
}

function pick<T>(xs: T[], n: number, rnd: () => number): T[] {
  const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, n);
}
function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }

// Difficulty slots per batch of 8, rotated so the overall mix is ~ 1/3 each and ~30%+ hard.
const DIFF_PLANS: Difficulty[][] = [
  ["easy", "easy", "easy", "medium", "medium", "medium", "hard", "hard"],
  ["easy", "easy", "medium", "medium", "medium", "hard", "hard", "hard"],
  ["easy", "easy", "medium", "medium", "hard", "hard", "hard", "easy"],
];

function systemPrompt() {
  return [
    "You write realistic synthetic text messages and emails for a scam-awareness training game. Output strict JSON only.",
    "HARD RULES:",
    "- Use ONLY fictional company, bank, carrier, agency, app and store names. Never mention any real brand, bank, carrier, government agency, app, payment service or famous person.",
    "- Phone numbers must be in the fictional 555-01xx range only, e.g. (214) 555-0147 or 1-800-555-0199. SMS short codes (5 digits like 72684) are fine.",
    "- Scam links must use a fictional domain on a risky TLD (.top .xyz .help .click .live .info .site .online), optionally a lookalike like northbank-verify.help.",
    "- Legit messages either contain no domain or only <brandname>.example (e.g. parcelo.example). Legit emails come from an address @<brand>.example.",
    "- People: ordinary first names only.",
    "- Each text is 60-300 characters, natural, varied in wording and structure. Do not reuse the same opening across messages.",
    "- Write links normally (https://name.tld/path or name.tld). Never defang links (no hxxp), never use [brackets] or placeholders like [link].",
    "- red_flags[].why and why_legit are shown to players as if the message were real: never mention that names/domains/numbers are fictional, never mention .example, 555 numbers, templates, difficulty or these instructions.",
    "- Every message must plainly belong to the requested category, and the sender and brand must make sense together (a bakery does not hold parcels, a toll road does not send bank alerts).",
  ].join("\n");
}

function userPrompt(cat: Cat, plan: Difficulty[], brands: string[], names: string[], avoid: string[]) {
  const isScam = cat.label === "scam";
  const itemShape = isScam
    ? `{"channel":"sms|email|imessage","sender":"...","subject":"... or null","text":"...","difficulty":"easy|medium|hard","red_flags":[{"span":"exact substring copied from text","why":"short plain-English reason, max 90 chars"}]}`
    : `{"channel":"sms|email|imessage","sender":"...","subject":"... or null","text":"...","difficulty":"easy|medium|hard","why_legit":"the reassuring cue, max 120 chars"}`;
  return [
    `Write ${plan.length} ${isScam ? "SCAM" : "LEGITIMATE (safe, real-looking)"} messages for category "${cat.id}".`,
    `Category: ${cat.brief}`,
    `Channels: ${cat.channels}. sms sender = a phone number like +1 (214) 555-0147 or a 5-digit short code (person-to-person texts come from a mobile number like (469) 555-0132 or a saved contact first name); email sender = an email address (email items should have a subject); imessage sender = a phone number or an email address.`,
    brands.length ? `Fictional organizations to use (or invent similar fictional ones of the same kind): ${brands.join(", ")}.` : "Do not mention any company or organization; this is person-to-person.",
    `People's first names to use: ${names.join(", ")}.`,
    `Difficulty for message 1..${plan.length} in order: ${plan.join(", ")}.`,
    `- easy: obvious. - medium: realistic. - hard: ${cat.hard}.`,
    isScam
      ? "For each scam give 1-3 red_flags. Each span MUST be copied character-for-character from text (3-60 chars), e.g. the link, the fee, the threat, the request for a code. why explains the danger simply."
      : "These are genuinely safe messages. Do not include any request to send money, codes, passwords, or to log in via a link.",
    avoid.length ? `Do not repeat these existing openings: ${avoid.map((a) => JSON.stringify(a)).join("; ")}` : "",
    `Return JSON exactly like {"messages":[${itemShape}, ...]} with ${plan.length} items.`,
  ].filter(Boolean).join("\n");
}

async function callModel(cat: Cat, batchNo: number, avoid: string[]): Promise<Raw[]> {
  const model = getConfig().nvidia.model;
  if (!model || !getConfig().nvidia.apiKey) throw new Error("NVIDIA_API_KEY / NEMOTRON_MODEL missing (run with --env-file=.env)");
  const rnd = rng(hash(cat.id) + batchNo * 7919);
  const plan = DIFF_PLANS[batchNo % DIFF_PLANS.length];
  const brands = pick(cat.brands, 5, rnd);
  const names = pick(NAMES, 5, rnd);
  const temperature = [0.7, 0.8, 0.9][batchNo % 3];
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const r = await chat({
        model, temperature, maxTokens: 4000, signal: AbortSignal.timeout(120_000),
        messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: userPrompt(cat, plan, brands, names, avoid) }],
      });
      const items = parseItems(r.content ?? "");
      if (items && items.length) return items;
      stats.parseFailures++;
      log(`  ${cat.id} batch ${batchNo}: unparseable output (attempt ${attempt})`);
    } catch (e) {
      stats.callErrors++;
      log(`  ${cat.id} batch ${batchNo}: ${(e as Error).message} (attempt ${attempt})`);
      await sleep(2000 * attempt * attempt);
    }
  }
  return [];
}

function hash(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }
function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function log(s: string) { process.stderr.write(s + "\n"); }
const stats = { calls: 0, auditCalls: 0, parseFailures: 0, callErrors: 0, rawItems: 0 };

/**
 * Second model pass: a stricter reviewer rejects items that don't fit the category, have the wrong label, use
 * brands incoherently, or (for scams) flag spans that aren't actually suspicious. Fails open if the reviewer errors.
 */
async function audit(cat: Cat, items: Omit<Rec, "id">[], drops: Drop[]): Promise<Omit<Rec, "id">[]> {
  if (!items.length) return items;
  const isScam = cat.label === "scam";
  const list = items.map((r, i) => JSON.stringify({ i, sender: r.sender, ...(r.subject ? { subject: r.subject } : {}), text: r.text, ...(isScam ? { red_flags: r.red_flags.map((f) => f.span) } : {}) })).join("\n");
  const criteria = [
    `1. It is about a clearly different topic than category "${cat.id}" (${cat.brief}). Small variations in tactic, amount or payment method are fine.`,
    isScam
      ? "2. It is not actually a scam (a careful person would find nothing wrong)."
      : "2. It is not actually safe: it pushes you to pay, renew, log in or act through a link under time pressure, asks for a code, password, PIN or personal details, or uses a suspicious domain.",
    "3. The organization or sender makes no sense for the content (e.g. a bakery holding a parcel, a toll road sending a bank alert, a store sending a court notice) or the sender contradicts the text.",
    "4. It is garbled, self-contradictory, contains placeholders, or names a real company, agency or famous person.",
    isScam ? "5. Every red_flags entry is not something genuinely suspicious (e.g. it is just a company name or a harmless phrase)." : "",
  ].filter(Boolean).join("\n");
  const intro = isScam
    ? "You review a training dataset of SCAM messages. These items are SUPPOSED to be scams, so suspicious content (links, fees, pressure, odd payment methods) is expected and is never a reason to reject."
    : "You review a training dataset of LEGITIMATE (safe) messages. They should look like real, harmless messages.";
  const prompt = `${intro}\nReject an item ONLY if one of these numbered rules applies:\n${criteria}\nItems (one JSON per line):\n${list}\nReturn one JSON object only: {"reject":[{"i":<index>,"rule":<rule number>,"reason":"<short>"}]}. Most items should pass; use {"reject":[]} if all are fine.`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      stats.auditCalls++;
      const r = await chat({ model: getConfig().nvidia.model, temperature: 0.1, maxTokens: 1500, signal: AbortSignal.timeout(90_000), messages: [{ role: "user", content: prompt }] });
      const parsed = firstJsonObject(r.content ?? "") as { reject?: { i?: unknown; rule?: unknown; reason?: unknown }[] } | null;
      if (!parsed) throw new Error("unparseable audit output");
      const rejected = new Map<number, string>();
      for (const x of parsed.reject ?? []) if (typeof x.i === "number" && x.rule !== undefined) rejected.set(x.i, `rule${x.rule} ${String(x.reason ?? "")}`.slice(0, 90));
      for (const [i, why] of rejected) if (items[i]) drops.push({ reason: `audit_reject:${why}`, category: cat.id, text: items[i].text.slice(0, 80) });
      return items.filter((_, i) => !rejected.has(i));
    } catch (e) {
      log(`  ${cat.id} audit failed (attempt ${attempt}): ${(e as Error).message}`);
      await sleep(1500 * attempt);
    }
  }
  return items;
}

async function genCategory(cat: Cat, drops: Drop[], existing: Omit<Rec, "id">[] = []): Promise<Omit<Rec, "id">[]> {
  const kept: Omit<Rec, "id">[] = [...existing];
  const maxBatches = Math.ceil(cat.target / BATCH) + 4;
  const needHard = Math.ceil(cat.target * 0.3);
  const enough = () => kept.length >= cat.target && kept.filter((k) => k.difficulty === "hard").length >= needHard;
  for (let b = 0; b < maxBatches && !enough(); b++) {
    stats.calls++;
    const avoid = kept.slice(-10).map((k) => k.text.split(/\s+/).slice(0, 6).join(" "));
    const items = await callModel(cat, b, avoid);
    stats.rawItems += items.length;
    const valid: Omit<Rec, "id">[] = [];
    for (const it of items) {
      const v = validate(it, cat);
      if (isDrop(v)) drops.push(v); else valid.push(v);
    }
    const audited = await audit(cat, valid, drops);
    const merged = dedupe([...kept, ...audited], drops);
    kept.splice(0, kept.length, ...merged);
    log(`  ${cat.id} batch ${b}: ${items.length} raw, ${kept.length}/${cat.target} kept`);
  }
  if (existing.length) return [...existing, ...selectMix(kept.slice(existing.length), cat.target - existing.length)];
  return selectMix(kept, cat.target);
}

/** Keep `n` items with a difficulty mix of roughly 35% hard / 35% medium / 30% easy (generation order within each). */
function selectMix<T extends { difficulty: Difficulty }>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const want: Record<Difficulty, number> = { hard: Math.round(n * 0.35), medium: Math.round(n * 0.35), easy: 0 };
  want.easy = n - want.hard - want.medium;
  const chosen = new Set<T>();
  for (const d of ["hard", "medium", "easy"] as Difficulty[]) for (const it of items.filter((x) => x.difficulty === d).slice(0, want[d])) chosen.add(it);
  for (const it of items) if (chosen.size < n) chosen.add(it);
  return items.filter((x) => chosen.has(x));
}

async function pool<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}

// ---------------------------------------------------------------------------------------------
// Output + report
// ---------------------------------------------------------------------------------------------
const BRAND_NAMES = new Set(Object.values(BRANDS).flat().map((b) => b.toLowerCase()));

// Explanations are player-facing: strip "fictional", ".example", "555", "template/pattern" meta-talk the model sometimes leaks.
const META = /fictional|\.example|\b555\b|555-01|template|\bpattern\b|\bspecified\b|mirrors|synthetic|dataset|difficulty|\bhard (?:case|example)/i;
function cleanWhy(t: string, label: Label): string {
  let x = t
    .replace(/(?:a |the )?fictional (?:\.example )?domain/gi, label === "legit" ? "the company's own domain" : "an unofficial domain")
    .replace(/(?:on |from )?(?:a |an |the )?\.example domain/gi, (m) => (m.startsWith("on") ? "on the company's own domain" : m.startsWith("from") ? "from the company's own domain" : "the company's own domain"))
    .replace(/^Fictional (\.[a-z]+ domain)/i, "Unusual $1")
    .replace(/^Fictional store name/i, "Unknown store name")
    .replace(/\bfictional\s+/gi, "");
  if (!/^iMessage/.test(x)) x = x.charAt(0).toUpperCase() + x.slice(1);
  return META.test(x) ? "" : x;
}

/** Last cleanup: tidy senders and drop red flags that are just an organization's name (not a real warning sign). */
function postFix(r: Omit<Rec, "id">): Omit<Rec, "id"> | null {
  const sender = r.sender.replace(/\s*\((?:saved )?contact\)\s*$/i, "").trim();
  const red_flags = r.red_flags
    .filter((f) => !BRAND_NAMES.has(f.span.toLowerCase()) && f.span.toLowerCase() !== sender.toLowerCase())
    .map((f) => ({ span: f.span, why: cleanWhy(f.why, "scam") }))
    .filter((f) => f.why);
  if (r.label === "scam" && red_flags.length === 0) return null;
  const out: Omit<Rec, "id"> = { ...r, sender, red_flags };
  delete out.why_legit;
  const wl = r.why_legit ? cleanWhy(r.why_legit, "legit") : "";
  return wl ? { ...out, why_legit: wl } : out;
}

function finalize(recs: Omit<Rec, "id">[], drops: Drop[]): Rec[] {
  const fixed = recs.flatMap((r) => { const f = postFix(r); if (!f) drops.push({ reason: "only_brand_name_flags", category: r.category, text: r.text.slice(0, 80) }); return f ? [f] : []; });
  const deduped = dedupe(fixed, drops);
  const order = (c: string) => c;
  const sorted = deduped.map((r, i) => ({ r, i })).sort((a, b) => order(a.r.category).localeCompare(order(b.r.category)) || a.i - b.i).map((x) => x.r);
  return sorted.map((r, i) => {
    const id = `bm-${String(i + 1).padStart(4, "0")}`;
    const { channel, sender, subject, text, label, category, difficulty, red_flags, why_legit, source } = r;
    return { id, channel, sender, subject, text, label, category, difficulty, red_flags, ...(why_legit ? { why_legit } : {}), source };
  });
}

function readExisting(): Rec[] {
  if (!fs.existsSync(OUT)) return [];
  return fs.readFileSync(OUT, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Rec);
}

function write(recs: Rec[]) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, recs.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

/** Full re-validation of the written file; returns problems (empty = clean). */
function check(recs: Rec[]): string[] {
  const problems: string[] = [];
  const catMap = new Map(CATS.map((c) => [c.id, c]));
  const ids = new Set<string>();
  const norms = new Set<string>();
  for (const r of recs) {
    const p = (m: string) => problems.push(`${r.id}: ${m}`);
    if (!/^bm-\d{4}$/.test(r.id) || ids.has(r.id)) p("bad/duplicate id"); ids.add(r.id);
    const cat = catMap.get(r.category); if (!cat) { p("unknown category"); continue; }
    if (cat.label !== r.label) p("label/category mismatch");
    if (!CHANNELS.has(r.channel)) p("bad channel");
    if (!DIFFS.has(r.difficulty)) p("bad difficulty");
    if (r.text.length < 40 || r.text.length > 320) p("length");
    if (r.source !== SOURCE) p("source");
    const prob = contentProblem(r); if (prob) p(prob);
    if (r.label === "scam") {
      if (r.red_flags.length < 1 || r.red_flags.length > 3) p("flag count");
      for (const f of r.red_flags) {
        if (!r.text.includes(f.span)) p(`span not in text: ${f.span}`);
        if (f.span.length < 3 || f.span.length > 60) p(`span length: ${f.span}`);
        if (!f.why || f.why.length > 90) p("why length");
      }
    } else {
      if (r.red_flags.length) p("legit has red flags");
      if (r.why_legit && r.why_legit.length > 120) p("why_legit length");
    }
    const n = norm(r.text); if (norms.has(n)) p("duplicate text"); norms.add(n);
  }
  return problems;
}

function report(recs: Rec[], drops: Drop[]) {
  const count = <K extends string>(f: (r: Rec) => K) => recs.reduce((m, r) => ((m[f(r)] = (m[f(r)] ?? 0) + 1), m), {} as Record<string, number>);
  const pct = (n: number) => `${((100 * n) / recs.length).toFixed(1)}%`;
  const labels = count((r) => r.label);
  console.log(`\nTotal: ${recs.length}`);
  console.log(`Labels: ${Object.entries(labels).map(([k, v]) => `${k} ${v} (${pct(v)})`).join(", ")}`);
  console.log(`Difficulty: ${Object.entries(count((r) => r.difficulty)).map(([k, v]) => `${k} ${v} (${pct(v)})`).join(", ")}`);
  for (const l of ["scam", "legit"]) {
    const sub = recs.filter((r) => r.label === l);
    const hard = sub.filter((r) => r.difficulty === "hard").length;
    console.log(`  ${l}: hard ${hard}/${sub.length} (${((100 * hard) / (sub.length || 1)).toFixed(0)}%)`);
  }
  console.log(`Channels: ${Object.entries(count((r) => r.channel)).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  console.log("Per category:");
  for (const [k, v] of Object.entries(count((r) => `${r.label}\t${r.category}`)).sort()) console.log(`  ${k}\t${v}`);
  if (drops.length) {
    const byReason = drops.reduce((m, d) => { const k = d.reason.split(":")[0]; m[k] = (m[k] ?? 0) + 1; return m; }, {} as Record<string, number>);
    console.log(`Dropped: ${drops.length} -> ${Object.entries(byReason).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  }
  const problems = check(recs);
  console.log(problems.length ? `VALIDATION FAILED (${problems.length}):\n  ${problems.slice(0, 30).join("\n  ")}` : "Validation: OK (all records pass)");
  return problems;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (n: string) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };

  if (args.includes("--validate")) { const p = report(readExisting(), []); process.exit(p.length ? 1 : 0); }

  if (opt("drop")) {
    const ids = new Set(opt("drop")!.split(","));
    const existing = readExisting();
    const recs = finalize(existing.filter((r) => !ids.has(r.id)).map(({ id: _id, ...r }) => r), []);
    write(recs);
    console.log(`Dropped ${existing.length - recs.length} records by id.`);
    report(recs, []);
    return;
  }

  if (args.includes("--fill")) {
    // Top up categories that are below target (e.g. after --drop), keeping every existing reviewed record.
    const existing = readExisting().map(({ id: _id, ...r }) => r);
    const short = CATS.filter((c) => existing.filter((r) => r.category === c.id).length < c.target);
    const drops: Drop[] = [];
    log(`Filling ${short.map((c) => c.id).join(", ") || "(nothing)"}...`);
    const filled = await pool(short, CONCURRENCY, (c) => genCategory(c, drops, existing.filter((r) => r.category === c.id)));
    const untouched = existing.filter((r) => !short.some((c) => c.id === r.category));
    const before = new Set(existing.map((r) => r.text));
    const recs = finalize([...untouched, ...filled.flat()], drops);
    write(recs);
    console.log("New records:");
    for (const r of recs.filter((x) => !before.has(x.text))) console.log(`  ${r.id} ${r.category} ${r.difficulty} [${r.sender}] ${r.text.replace(/\n+/g, " / ")}${r.red_flags.length ? `\n     flags: ${r.red_flags.map((f) => f.span).join(" | ")}` : ""}`);
    report(recs, drops);
    return;
  }

  const only = opt("only")?.split(",").map((s) => s.trim()).filter(Boolean);
  if (only) for (const o of only) if (!CATS.some((c) => c.id === o)) throw new Error(`unknown category ${o}`);
  const todo = only ? CATS.filter((c) => only.includes(c.id)) : CATS;
  const kept = only ? readExisting().filter((r) => !only.includes(r.category)).map(({ id: _id, ...r }) => r) : [];

  const t0 = Date.now();
  const drops: Drop[] = [];
  log(`Generating ${todo.length} categories with ${getConfig().nvidia.model} (concurrency ${CONCURRENCY})...`);
  const results = await pool(todo, CONCURRENCY, (c) => genCategory(c, drops));
  const recs = finalize([...kept, ...results.flat()], drops);
  write(recs);
  log(`Wrote ${recs.length} records to ${path.relative(process.cwd(), OUT)} in ${((Date.now() - t0) / 1000).toFixed(0)}s; generation calls ${stats.calls}, audit calls ${stats.auditCalls}, raw items ${stats.rawItems}, parse failures ${stats.parseFailures}, call errors ${stats.callErrors}`);
  for (const c of todo) { const n = recs.filter((r) => r.category === c.id).length; if (n < c.target) log(`  WARN ${c.id}: ${n}/${c.target}`); }
  const reasons = drops.filter((d) => d.reason !== "duplicate_near" && d.reason !== "duplicate_exact").slice(0, 25);
  if (reasons.length) log(`Sample drops:\n  ${reasons.map((d) => `[${d.category}] ${d.reason} :: ${d.text}`).join("\n  ")}`);
  const problems = report(recs, drops);
  if (problems.length) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
