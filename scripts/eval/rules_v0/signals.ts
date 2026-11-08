/** Maps raw page signals + domain intel to evidence keys, and message text to evidence keys (rules-only paths). */
export type PageSignals = Partial<{
  has_card_field: boolean; gift_card_or_crypto_only: boolean; countdown_timer: boolean; scarcity_banner: boolean;
  no_contact_page: boolean; no_refund_policy: boolean; brand_words_in_title: boolean; https: boolean; discount_pct: number;
}>;

export type DomainIntel = { ageDays: number | null; brandCloneOf?: string | null; allowlisted?: boolean; tld?: string };

const RISKY_TLDS = new Set(["top", "xyz", "icu", "help", "click", "live", "support", "work", "rest", "cfd", "sbs"]);

export function pageKeys(signals: PageSignals, intel: DomainIntel): string[] {
  const k: string[] = [];
  if (signals.gift_card_or_crypto_only) k.push("gift_card_only");
  if (signals.countdown_timer) k.push("countdown_timer");
  if (signals.scarcity_banner) k.push("scarcity_banner");
  if (signals.no_contact_page === true) k.push("no_contact_page");
  if (signals.no_contact_page === false) k.push("has_contact_page");
  if (signals.no_refund_policy === true) k.push("no_refund_policy");
  if (signals.no_refund_policy === false) k.push("has_refund_policy");
  if (signals.brand_words_in_title || intel.brandCloneOf) k.push("brand_clone");
  if (signals.https === false) k.push("no_https");
  if (signals.https === true) k.push("https_ok");
  if ((signals.discount_pct ?? 0) >= 60) k.push("too_good_discount");
  if (intel.ageDays != null) {
    if (intel.ageDays < 30) k.push("domain_age_lt_30");
    else if (intel.ageDays < 90) k.push("domain_age_lt_90");
    else if (intel.ageDays > 365) k.push("domain_age_gt_365");
  }
  if (intel.allowlisted) k.push("allowlisted");
  if (intel.tld && RISKY_TLDS.has(intel.tld.toLowerCase())) k.push("risky_tld");
  return k;
}

const URL_RE = /\bhttps?:\/\/[^\s]+|\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:top|xyz|icu|help|click|live|support|co|net|com|info)\b(?:\/[^\s]*)?/gi;

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,)]+$/, "")))];
}

/** Heuristic keys for a message; deterministic and used as the fallback and as the stand-in baseline. */
export function messageKeys(text: string): string[] {
  const t = text.toLowerCase();
  const k = new Set<string>();
  if (/(within|in|next)\s+\d+\s*(hrs?|hours?|minutes?|mins?)|\bimmediately\b|\burgent\b|\bfinal notice\b|\bact now\b|\btonight\b|expires?\b/.test(t)) k.add("urgency_language");
  if (/(fine|penalt|suspend|legal action|arrest|locked|closed|terminated)/.test(t)) k.add("threat_language");
  if (/\b(pin|password|ssn|social security|card number|cvv|verification code|otp)\b/.test(t)) k.add("credential_request");
  if (/\$\s?\d+(\.\d\d)?\s*(redelivery|shipping|processing|release|handling)?\s*fee|pay (a )?(small )?fee|redelivery fee|shipping fee/.test(t)) k.add("small_fee_request");
  if (/gift\s?cards?/.test(t) && /(buy|purchase|send|need|get)/.test(t)) k.add("gift_card_request");
  if (/\bcall\b[^.]{0,30}\d{3}[-.\s]\d{3,4}|1-?8\d\d-?\d{3}-?\d{4}/.test(t)) k.add("phone_callback");
  if (/(turned \$?\d+ into|guaranteed (profit|returns?)|double your|10x|risk[- ]free)/.test(t)) k.add("too_good_returns");
  if (/\b([6-9]\d|100)\s?%\s*off\b/.test(t)) k.add("too_good_discount");
  if (/(gift\s?cards?|crypto(currency)?)\s*(or\s*\w+\s*)?only|only\s+(accepts?\s+)?(gift\s?cards?|crypto)/.test(t)) k.add("gift_card_only");
  if (/offer ends in|sale ends in|\d{1,2}:\d{2}\s*(left|remaining)?$/.test(t)) k.add("countdown_timer");
  if (/(don'?t tell|keep (this|it) (a )?secret|between us)/.test(t)) k.add("secrecy_request");
  for (const u of extractUrls(text)) {
    const host = u.replace(/^https?:\/\//, "").split("/")[0].toLowerCase();
    const tld = host.split(".").pop() ?? "";
    if (RISKY_TLDS.has(tld) || /(-|\.)(verify|secure|redeliver|pay|login|update|support)\b/.test(host)) k.add("lookalike_domain");
  }
  const scammy = [...k].some((x) => x !== "no_ask");
  if (!scammy) {
    k.add("no_ask");
    if (/(official app|number on the back of your card|call the number on)/.test(t)) k.add("directs_to_official_channel");
  }
  return [...k];
}
