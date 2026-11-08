/** Page-level fact extraction from raw HTML. Pure (no network). Everything here is evidence, never instructions. */

export type PageType = "home" | "contact" | "about" | "refund" | "shipping" | "privacy" | "terms" | "faq" | "checkout" | "product" | "other";
export type Quote = { id: string; quote: string };
export type FormFacts = { fields: string[]; actionHost: string | null };

export type PageFacts = {
  url: string; path: string; status: number; type: PageType; title: string; description: string; h1: string;
  text: string; wordCount: number;
  internalLinks: { url: string; text: string }[]; externalHosts: string[];
  forms: FormFacts[]; prices: number[]; discounts: number[]; emails: string[]; phones: string[]; addresses: string[];
  payments: string[]; policyFlags: Quote[]; pressure: string[]; placeholders: string[]; copyrightYears: number[];
  companyNames: string[]; selfDescribedDemo: boolean; generator: string | null; scriptHosts: string[];
};

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16))).replace(/&[a-z]+;/gi, " ");
const uniq = <T,>(a: T[]) => [...new Set(a)];
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const TYPE_RULES: [PageType, RegExp][] = [
  ["refund", /refund|return|exchange/],
  ["contact", /contact|get-in-touch|reach-us|customer-service/],
  ["about", /about|our-story|who-we-are|company/],
  ["terms", /terms|conditions|\btos\b|legal|membership/],
  ["privacy", /privacy|cookie/],
  ["shipping", /shipping|delivery|track/],
  ["faq", /(^|\/)(faq|help|support|questions)/],
  ["checkout", /checkout|cart|basket|payment|\/pay\b|pay\.html|verify/],
  ["product", /product|item|\/p\/|\/dp\/|catalogue|catalog|collections|\/shop\/.+|plans|book_|\/category\//],
];

export function classify(path: string, title = "", anchor = ""): PageType {
  if (path === "/" || path === "" || /^\/(index\.html?)?$/.test(path)) return "home";
  const p = path.toLowerCase(), t = `${title} ${anchor}`.toLowerCase();
  for (const [type, re] of TYPE_RULES) if (re.test(p)) return type;
  for (const [type, re] of TYPE_RULES) if (re.test(t)) return type;
  return "other";
}

const PAYMENTS: [string, RegExp][] = [
  ["card", /\b(visa|mastercard|american express|amex|discover|credit card|debit card)\b/i], ["paypal", /\bpaypal\b/i], ["apple_pay", /apple pay/i], ["google_pay", /google pay/i],
  ["shop_pay", /shop pay/i], ["klarna_afterpay", /\b(klarna|afterpay|affirm)\b/i], ["zelle", /\bzelle\b/i], ["venmo", /\bvenmo\b/i], ["cash_app", /cash ?app/i],
  ["bank_transfer", /\b(bank|wire) transfer\b/i], ["money_transfer", /\b(western union|moneygram)\b/i], ["crypto", /\b(bitcoin|btc|usdt|ethereum|crypto(currency)?|wallet address)\b/i], ["gift_card", /\bgift ?cards?\b/i],
];
export const RISKY_PAYMENTS = new Set(["zelle", "venmo", "cash_app", "bank_transfer", "money_transfer", "crypto", "gift_card"]);

const POLICY: [string, RegExp][] = [
  ["all_sales_final", /all sales (are )?final|final sale/i],
  ["no_refunds", /no (returns or )?refunds|non-?refundable|not refundable/i],
  ["store_credit_only", /store credit only|refunds? (are |will be )?issued (as|in) store credit/i],
  ["restocking_fee", /\b([2-9]\d)\s?% restocking fee/i],
  ["short_return_window", /within ([1-5]) days of (delivery|receipt|purchase)/i],
  ["long_refund_delay", /(processed|issued|refunded) within ([6-9]\d|\d{3}) (business )?days/i],
  ["overseas_returns", /(ship|send|return)[^.]{0,80}\b(china|shenzhen|hong kong|overseas|abroad)\b/i],
  ["auto_renew", /renews? automatically|auto-?renew|automatically renew|billed (monthly|every month)|per month (until|unless) cancel/i],
  ["cancel_by_mail", /cancel[^.]{0,120}(postal mail|by mail|in writing|signed letter)/i],
  ["hidden_membership", /(join|enrol+|subscribe)[^.]{0,60}(membership|subscription|priority)[^.]{0,80}\$\s?\d/i],
  ["chargeback_threat", /chargebacks?[^.]{0,40}(collection|legal action|reported)/i],
  ["data_sharing", /share (your )?(personal )?(information|data) with (our )?(marketing |advertising )?(partners|third parties)/i],
  ["no_phone_support", /(no|not offer|do not (offer|provide)|don't offer) phone support|phone support is not available|no phone or chat/i],
  ["card_unavailable", /card payments? (are|is) (temporarily )?(unavailable|not accepted)/i],
];
const PRESSURE: [string, RegExp][] = [
  ["countdown", /(ends|expires|late fees apply|reschedule within|offer ends) in \d{1,2}:\d{2}/i], ["scarcity", /only \d+ left|\d+ people are viewing|almost gone|selling fast|limited stock/i],
  ["final_notice", /final notice|act now|pay (today|now) to avoid|returns? to sender soon/i], ["threat", /\b(a|\$\d+) fine\b|license suspension|account suspension|(referred|reported) to collections?|collection agenc|legal action|\barrest/i],
];
const FIELD_RES: [string, RegExp][] = [
  ["card_number", /cc-number|card.?number|card_number|cardnumber/i], ["cvv", /cc-csc|cvv|cvc|security.?code/i], ["ssn", /\bssn\b|social.?security/i],
  ["dob", /bday|birth|dob/i], ["license", /licen[cs]e/i], ["password", /type=["']?password/i], ["gift_card", /gift.?card/i], ["crypto_wallet", /wallet|btc|usdt/i], ["email", /type=["']?email|autocomplete=["']email/i],
];

export function extractPage(html: string, url: string, status = 200): PageFacts {
  const u = new URL(url);
  // Our own "Demo store, not real" labels are for humans; the scanner judges the site as a shopper would see it.
  // Control characters (e.g. \u0000 inside inline JSON) can't be stored in Postgres jsonb.
  // eslint-disable-next-line no-control-regex
  const raw = html.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, " ").replace(/<(\w+)[^>]*\sdata-demo-label[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const noScript = raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>|<svg[\s\S]*?<\/svg>|<!--[\s\S]*?-->/gi, " ");
  const text = decodeEntities(noScript.replace(/<(br|p|div|li|h\d|tr|section|article)\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const flat = text.replace(/\s+/g, " ");
  const title = decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? "").replace(/\s+/g, " ").trim();
  const description = decodeEntities(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(raw)?.[1] ?? "").trim();
  const h1 = decodeEntities((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(raw)?.[1] ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

  const internal: { url: string; text: string }[] = [];
  const external: string[] = [];
  for (const m of raw.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = /href=["']([^"'#][^"']*)["']/i.exec(m[1])?.[1];
    if (!href || /^(mailto|tel|javascript|data):/i.test(href)) continue;
    let abs: URL;
    try { abs = new URL(decodeEntities(href), u); } catch { continue; }
    if (!/^https?:$/.test(abs.protocol)) continue;
    abs.hash = "";
    const anchor = decodeEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 60);
    if (abs.host === u.host) internal.push({ url: abs.toString(), text: anchor });
    else external.push(abs.hostname.replace(/^www\./, ""));
  }

  const forms: FormFacts[] = [...raw.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].map((m) => {
    const inputs = [...m[2].matchAll(/<(input|select|textarea)\b[^>]*>/gi)].map((x) => x[0]);
    const action = /action=["']([^"']+)["']/i.exec(m[1])?.[1];
    let actionHost: string | null = null;
    if (action) { try { const a = new URL(action, u); if (a.host !== u.host) actionHost = a.hostname; } catch { /* ignore */ } }
    return { fields: uniq(FIELD_RES.filter(([, re]) => inputs.some((i) => re.test(i))).map(([k]) => k)), actionHost };
  }).filter((f) => f.fields.length);

  // The sentence around a match, bounded by line breaks or sentence punctuation (not the dot in "$19.99").
  const sentence = (re: RegExp) => {
    const m = re.exec(text);
    if (!m) return null;
    const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
    const s = Math.max(before.lastIndexOf("\n"), ...[...before.matchAll(/[.!?](?=\s+[A-Z"“(])/g)].map((x) => x.index ?? -1)) + 1;
    const nl = after.indexOf("\n"), dot = after.search(/[.!?](\s|$)/);
    const e = Math.min(nl < 0 ? Infinity : nl, dot < 0 ? Infinity : dot + 1);
    return clip(text.slice(s, m.index + m[0].length + (e === Infinity ? after.length : e)).replace(/\s+/g, " ").trim(), 220);
  };
  const prices = uniq([...flat.matchAll(/\$\s?(\d{1,5}(?:,\d{3})*(?:\.\d{2})?)/g)].map((m) => Number(m[1].replace(/,/g, "")))).filter((n) => n > 0).slice(0, 40);
  const discounts = uniq([...flat.matchAll(/(\d{2})\s?%\s*off/gi)].map((m) => Number(m[1])));
  // was/now pairs: a struck-through or "was" price next to the selling price
  for (const m of raw.matchAll(/class=["']price["'][^>]*>\s*\$?([\d,.]+)\s*<\/span>\s*<span[^>]*class=["']was["'][^>]*>\s*\$?([\d,.]+)/gi)) {
    const now = Number(m[1].replace(/,/g, "")), was = Number(m[2].replace(/,/g, ""));
    if (was > now && now > 0) discounts.push(Math.round((1 - now / was) * 100));
  }
  for (const m of raw.matchAll(/<(s|del|strike)>\s*\$?([\d,.]+)\s*<\/\1>\s*(?:now\s*)?\$?([\d,.]+)/gi)) {
    const was = Number(m[2].replace(/,/g, "")), now = Number(m[3].replace(/,/g, ""));
    if (was > now && now > 0) discounts.push(Math.round((1 - now / was) * 100));
  }

  const years = [...flat.matchAll(/(?:©|copyright)\s*(\d{4})(?:\s*[-–]\s*(\d{4}))?/gi)].flatMap((m) => [Number(m[1])]).filter((y) => y > 1980 && y < 2100);
  const companies = uniq([...flat.matchAll(/\b([A-Z][A-Za-z&]+(?:\s[A-Z][A-Za-z&]+){0,3}),?\s(LLC|Inc\.?|Ltd\.?|Co\.,? Ltd\.?|Corporation|Corp\.?|GmbH|Limited|Media Group)(?=[\s.,;]|$)/g)].map((m) => `${m[1]} ${m[2]}`.replace(/\s+/g, " ")));
  const scriptHosts = uniq([...raw.matchAll(/<script[^>]+src=["'](https?:)?\/\/([^/"']+)/gi)].map((m) => m[2].replace(/^www\./, ""))).slice(0, 15);

  return {
    url, path: u.pathname, status, type: classify(u.pathname, title), title: clip(title, 120), description: clip(description, 200), h1: clip(h1, 120),
    text: clip(text, 6000), wordCount: flat ? flat.split(" ").length : 0,
    internalLinks: internal.slice(0, 300), externalHosts: uniq(external).slice(0, 30), forms,
    prices, discounts: uniq(discounts).filter((d) => d > 0 && d < 100),
    emails: uniq((flat.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []).map((e) => e.toLowerCase())).slice(0, 10),
    phones: uniq((flat.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{3,4}\)?[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g) ?? []).filter((p) => p.replace(/\D/g, "").length >= 10 && !/^\d{4}\s\d{4}\s\d{4}/.test(p))).slice(0, 6),
    addresses: uniq(flat.match(/\b\d{1,6}\s+[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+){0,3}\s(?:St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Ln|Lane|Way|Pkwy|Parkway|Hwy|Plaza|Cir|Circle)\.?(?:,?\s(?:Suite|Ste|Unit|#)\s?\w+)?,?\s[A-Z][A-Za-z]+(?:\s[A-Z][A-Za-z]+)?,?\s[A-Z]{2}\s\d{5}\b/g) ?? []).slice(0, 4),
    payments: PAYMENTS.filter(([, re]) => re.test(flat)).map(([k]) => k),
    policyFlags: POLICY.map(([id, re]) => { const q = sentence(re); return q ? { id, quote: q } : null; }).filter((x): x is Quote => !!x),
    pressure: uniq([...PRESSURE.filter(([, re]) => re.test(flat)).map(([k]) => k), ...(/data-countdown/i.test(raw) ? ["countdown"] : [])]),
    placeholders: uniq(flat.match(/\[(?:company|store|business|shop) name\]|lorem ipsum|your (?:store|company) name here/gi) ?? []),
    copyrightYears: uniq(years), companyNames: companies.slice(0, 6),
    selfDescribedDemo: /demo (website|store|site|shop)|for (web )?scraping (purposes|practice)|test sites?|practice (website|site)|automation (practice|exercise)/i.test(flat),
    generator: /<meta[^>]+name=["']generator["'][^>]*content=["']([^"']+)["']/i.exec(raw)?.[1]?.slice(0, 40) ?? (/cdn\.shopify\.com/i.test(raw) ? "Shopify" : /wp-content/i.test(raw) ? "WordPress" : null),
    scriptHosts,
  };
}
