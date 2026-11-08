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


/**
 * TLDs heavily abused in phishing links (public abuse reports). Message links only: page checks keep RISKY_TLDS above, so
 * page/site scoring is unchanged.
 */
const LINK_RISKY_TLDS = new Set([...RISKY_TLDS, "info", "site", "online", "shop", "club", "buzz", "vip", "cyou", "bond", "monster", "link"]);
const URL_TLDS = [...LINK_RISKY_TLDS, "co", "net", "com", "org", "io", "us"].join("|");
const URL_RE = new RegExp(`\\bhttps?:\\/\\/[^\\s]+|\\b[a-z0-9-]+(?:\\.[a-z0-9-]+)*\\.(?:${URL_TLDS})\\b(?:\\/[^\\s]*)?`, "gi");
/** Host words that make a link pose as a login, billing or support page of a real company. */
const LOOKALIKE_HOST = /(-|\.)(verify|secure|security|redeliver|redelivery|pay|payment|login|signin|update|support|billing|account|confirm|refund|claim|unlock|clearance|release|renew|penalty)\b/;

export function extractUrls(text: string): string[] {
  return [...new Set((text.match(URL_RE) ?? []).map((u) => u.replace(/[.,)]+$/, "")))];
}

/** True when `re` matches somewhere that is not negated just before it ("never share this code", "do not send"). */
function asks(t: string, re: RegExp): boolean {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  for (const m of t.matchAll(g)) {
    const before = t.slice(Math.max(0, m.index - 30), m.index);
    if (!/\b(never|don'?t|do not|won'?t|will not|not|no one)\b[^.!?\n]*$/.test(before)) return true;
  }
  return false;
}

/** Text within `n` characters of a match of `re` (one window per match). */
function windows(t: string, re: RegExp, n: number): string[] {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return [...t.matchAll(g)].map((m) => t.slice(Math.max(0, m.index - n), m.index + m[0].length + n));
}

const CRED_OBJECT = String.raw`(\bpin\b|password|passcode|\bssn\b|social security|card (number|details)|\bcvv\b|expiration date|(account|routing|case|member) number|account details|login (details|info|credentials)|credentials|(bank|billing|payment|personal) (details|info(rmation)?)|billing info|payment method|maiden name|date of birth|security questions?|your details)`;
const ASK_VERB = String.raw`\b(enter|re-?enter|confirm|verify|provide|send|share|give|tell|reply with|respond with|update|submit|type in)\b`;
const PHONE = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b|\b1-?8\d\d-?\d{3}-?\d{4}\b|\b555-\d{4}\b/;
/** A callback is a scam tell when it is how you cancel, dispute, unlock or claim something, not how you reschedule. */
const CALLBACK_CONTEXT = /\b(cancel|dispute|refund|avoid|remove|repair|unlock|reactivate|restore|verify|claim|resolve|clear|renew|payment|charges?|suspend\w*|immediately|now|if (you )?(did ?n[o']?t|do not))\b/;

/**
 * `no_ask` is only claimed when nothing asks for something risky (money, codes, details, a click or a call) and nothing
 * pitches (an investment, a job, a crisis, a stranger). Pressure alone (urgency, threats) does not cancel it.
 */
const ASK_OR_PITCH_KEYS = new Set(["credential_request", "small_fee_request", "gift_card_request", "payment_request", "code_share_request", "overpayment_refund", "lookalike_domain", "phone_callback", "gift_card_only",
  "too_good_returns", "unsolicited_investment", "easy_money", "emergency_story", "stranger_contact", "secrecy_request", "too_good_discount", "countdown_timer"]);

/**
 * Heuristic evidence keys for a message: deterministic, explainable regex rules. Used by the rules-only path (the basic
 * check, the fallback when Nemotron is unavailable) and by the keyword taxonomy fallback. Each rule names a general tactic,
 * not a phrase from one message; rules were tuned only on the train split of eval/messages_split.json.
 */
export function messageKeys(text: string): string[] {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const k = new Set<string>();

  // Pressure: a deadline in hours, "act now", "final notice", crowd pressure. Code expiry in minutes is not pressure.
  if (/\b(within|in|next)\s+\d+\s*(hrs?|hours?)\b|\bimmediately\b|\burgent(ly)?\b|\bfinal (notice|warning|reminder)\b|\bact (now|fast|quickly)\b|\basap\b|\bright away\b|\blast chance\b|\bbefore (it'?s too late|midnight|it'?s gone|they'?re gone)\b|\bhurry\b|\bmany (people|others) are (interested|asking)\b|\bdo not ignore\b|\b(pay|call|reply|respond|verify|act|confirm|click)\b[^.!?\n]{0,30}\b(within|in) \d+\s*(min|mins|minutes)\b/.test(t)) k.add("urgency_language");
  // Threat of a penalty or loss.
  if (/\b(fines?|fined|penalt(y|ies)|legal action|lawsuit|arrest(ed)?|warrant|lien|seiz(e|ed|ure))\b|\b(suspend(ed)?|suspension|terminated|deactivated|frozen)\b|\b(will|may) be (suspended|frozen|closed|locked|terminated|deactivated|deleted|cancell?ed|disconnected|revoked|limited)\b|\b(we will|we'll) (freeze|suspend|close|lock|terminate|deactivate|cancel)\b|\blose (access|your)\b|\baccount is (locked|on hold|restricted)\b/.test(t)) k.add("threat_language");
  // Asks for credentials or personal details (not a warning never to share them, not a "your password was changed" notice).
  if (asks(t, new RegExp(`${ASK_VERB}[^.!?\\n]{0,40}${CRED_OBJECT}`))) k.add("credential_request");
  // Asks you to send back a code you were texted (account takeover), including gift-card codes.
  if (asks(t, /\b(text|forward|read|reply with|respond with|give|tell|share|send (it|me|us|the|that|this|them))\b[^.!?\n]{0,30}\b(codes?|otp|passcode)\b|\b(text|send|read|forward|reply) (it|them|the code|that|this) back\b/)) k.add("code_share_request");
  // A fee to release a package, prize, job, refund or rental.
  if (/\$\s?\d+(\.\d\d)?\s+([\w'-]+\s+){0,3}fee\b|\bfee of \$\s?\d|\b(pay|paying)\b[^.!?\n]{0,30}\bfee\b|\bunpaid (toll|tolls|balance|fine|invoice|fee)s?\b[^\n]{0,80}\bpay\b/.test(t)) k.add("small_fee_request");
  // Asks you to send money by app, wire or link.
  if (asks(t, /\b(send|wire|transfer|pay)\s+(me\s+|us\s+|them\s+)?(the\s+|a\s+|your\s+)?([\w'-]+\s+){0,2}\$\s?\d|\bdeposit \$\s?\d|\bdeposit (a minimum|it)\b|\b(send|pay|wire[ds]?)\b[^.!?\n]{0,40}\bvia\b|\b(a|the) deposit via\b|\b(wire[ds]?|transfer)\b[^.!?\n]{0,30}\b(money|funds|balance|cash)\b|\b(money|funds) wired\b|\b(send|give|pay) (it|them|the money|the difference|that) back\b|\bspot me\b|\blend me\b|\bshort on cash\b|\bhelp me (out )?with the (flight|bill|cost|rent|fee|ticket)|\bwithout your help\b|\bbail money\b|\bneed bail\b|\bneed\b[^.!?\n]{0,15}\$\s?\d/)) k.add("payment_request");
  if (/gift\s?cards?/.test(t) && /\b(buy|purchase|send|need|get|grab|pick up)\b/.test(t)) k.add("gift_card_request");
  // "You were overpaid, send the difference back" and fake-check setups.
  if (/\b(accidentally|mistakenly|by mistake|in error|due to an error)\b[^.!?\n]{0,40}\b(sent|paid|overpaid|deposited)\b|\b(sent|paid) (you|your \w+) \$?\d+[\d,.]* (extra|too much|by mistake)|\boverpaid\b|\boverpayment\b|\bduplicate payment\b|\b(refund|return|send back) the (excess|difference|extra)\b|\bsend you a check\b[^.!?\n]{0,80}\bdeposit\b|\bdeposit it and\b/.test(t)) k.add("overpayment_refund");
  // A call-this-number step used to cancel, dispute, unlock or claim (not to reschedule).
  if (windows(t, /\bcall\b/, 90).some((w) => PHONE.test(w) && CALLBACK_CONTEXT.test(w))) k.add("phone_callback");
  if (/(turned \$?\d+ into|guaranteed (profits?|returns?|income)|double your|\b\d+x (my|your|the|their)?\s?(portfolio|money|investment|savings|returns?)\b|risk[- ]free|\b(minimal|no|zero) risk\b|\d+% (monthly|weekly|daily) (returns?|profits?|gains?)|\b(consistent|steady|passive) (weekly |monthly |daily )?(profits?|returns?|income)|returns are amazing|quick cash|make money fast)/.test(t)) k.add("too_good_returns");
  // An unsolicited crypto / trading pitch.
  if (/\b(crypto(currency)?|bitcoin|altcoins?|forex|trading (bot|app|group|signals?|platform)|vip signals|mentor (program|access)|investment opportunit(y|ies)|private (crypto |trading |investment )?group)\b/.test(t) && /\b(join|add you|interested|get started|access|want to|show you|opportunit|dm me|signals)\b/.test(t)) k.add("unsolicited_investment");
  // A job that pays well for little: rate or "no experience" in a recruiting pitch.
  if (/\b(job|hiring|position|role|opening|resume|remote|work from home|from home|data entry|staffing)\b/.test(t) && /\bno experience (needed|required|necessary)\b|\$\s?\d[\d,]*(\.\d\d)?\s*(\/\s?|per |an |a )(hr|hour|day|week)\b|\$\s?\d[\d,]* (weekly|daily)\b|\bquick cash\b|\beasy money\b/.test(t)) k.add("easy_money");
  // A crisis story that explains why money is needed now.
  if (/\bstuck (at the airport|abroad|overseas|out of town|here)\b|\bstranded\b|\b(wallet|purse|phone|passport) (got |was )?stolen\b|\b(got |been )?(detained|arrested)\b|\bin trouble with the law\b|\bbail\b|\bcar accident\b|\bmedical (emergency|bill)\b|\bhospital\b|\blost my (wallet|phone|passport)\b|\bnew phone,? who dis\b|\bflight (got )?(cancell?ed|delayed)\b/.test(t)) k.add("emergency_story");
  // Contact from a stranger: "wrong number", "got your number from", a dating-app match you never met.
  if (/\bwrong number\b|\bgot your number from\b|\b(saw|seen|found|looking at|came across) your profile\b|\bfrom the (dating )?app\b|\bfrom (the|a) (dating|trading) (app|site|forum)\b|\bhaven'?t met\b/.test(t)) k.add("stranger_contact");
  if (/\b([6-9]\d|100)\s?%\s*off\b/.test(t)) k.add("too_good_discount");
  if (/(gift\s?cards?|crypto(currency)?)\s*(or\s*\w+\s*)?only|only\s+(accepts?\s+)?(gift\s?cards?|crypto)|\b(pay|payment) (via|with|by) (gift\s?cards?|crypto|wire transfer)\b|\bwire transfer only\b/.test(t)) k.add("gift_card_only");
  if (/offer ends in|sale ends in|\d{1,2}:\d{2}\s*(left|remaining)?$/.test(t)) k.add("countdown_timer");
  if (/(don'?t tell|keep (this|it) (a )?secret|between us)/.test(t)) k.add("secrecy_request");
  for (const u of extractUrls(text)) {
    const host = u.replace(/^https?:\/\//i, "").split("/")[0].toLowerCase();
    const tld = host.split(".").pop() ?? "";
    if (LINK_RISKY_TLDS.has(tld) || LOOKALIKE_HOST.test(host)) k.add("lookalike_domain");
  }
  // Legit cues. A one-time code that comes with a "never share it" warning, and pointers to the official app or card.
  if (/\b(code|otp|passcode)\b[^.!?\n]{0,25}\b\d{4,8}\b|\b\d{4,8}\b[^.!?\n]{0,25}\b(code|otp)\b|\bcode:? \d{4,8}\b/.test(t) && /\b(never|don'?t|do not)\s+share\b|\bwill never ask\b|\bif you didn'?t request (this|it)\b/.test(t) && !k.has("code_share_request")) k.add("otp_notice");
  if (/\bofficial app\b|\bnumber on the back of your card\b|\bcall the number on\b|\bopen (the|your) ([\w&]+ ){0,2}app\b|\b(in|via|through) the app\b|\blog ?(in|into) (to )?(your account )?(directly|in the app)\b|\bsettings\s*(>|→)/.test(t)) k.add("directs_to_official_channel");
  if (![...k].some((x) => ASK_OR_PITCH_KEYS.has(x))) k.add("no_ask");
  return [...k];
}
