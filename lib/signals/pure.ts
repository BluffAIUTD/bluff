import type { PageSignals } from "../rules/signals";

const BRAND_WORDS = ["nike", "adidas", "usps", "fedex", "e-zpass", "ezpass", "amazon", "paypal", "apple"];

export type SignalParts = {
  /** visible text of the page (no input values), any case */
  text: string; title: string;
  /** visible text of each link */
  linkTexts: string[];
  hasCardField: boolean; hasCountdownAttr: boolean; https: boolean; hostLabel: string;
};

/**
 * The one definition of the page signals. Used by the server (our own storefront HTML) and by the browser extension
 * (live DOM), so the two can never drift. Takes only booleans/text derived from the page, never input values.
 */
export function signalsFromParts(p: SignalParts): PageSignals {
  const text = p.text.replace(/\s+/g, " ").toLowerCase();
  const title = p.title.toLowerCase();
  const discount = /(\d{2,3})\s?%\s*off/.exec(text);
  return {
    has_card_field: p.hasCardField,
    gift_card_or_crypto_only: /(gift\s?cards?|crypto(currency)?)\s*(or\s*\w+\s*)?only|only\s+(accepts?\s+)?(gift\s?cards?|crypto)/.test(text),
    countdown_timer: p.hasCountdownAttr || /(ends|expires)\s+in\s+\d{1,2}:\d{2}/.test(text),
    scarcity_banner: /only\s+\d+\s+left|almost gone|selling fast/.test(text),
    no_contact_page: !p.linkTexts.some((l) => /contact|about|support/.test(l.toLowerCase())),
    no_refund_policy: !/refund|returns?\s+(policy|accepted)|money[- ]back/.test(text),
    brand_words_in_title: BRAND_WORDS.some((b) => title.includes(b) && !p.hostLabel.toLowerCase().includes(b)),
    https: p.https,
    ...(discount ? { discount_pct: Number(discount[1]) } : {}),
  };
}
