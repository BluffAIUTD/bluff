/** Evidence keys with direction and weight (engineering_spec §6.4). Small, fixed table. */
export type Direction = "scam" | "legit";
export type KeyMeta = { dir: Direction; w: number; evidence: string; category?: string };

export const KEYS: Record<string, KeyMeta> = {
  // --- page / domain signals ---
  domain_age_lt_30: { dir: "scam", w: 0.25, evidence: "Domain registered less than 30 days ago" },
  domain_age_lt_90: { dir: "scam", w: 0.12, evidence: "Domain registered less than 90 days ago" },
  gift_card_only: { dir: "scam", w: 0.3, evidence: "Only accepts gift cards or crypto" },
  countdown_timer: { dir: "scam", w: 0.12, evidence: "Countdown timer pressures you to buy now" },
  scarcity_banner: { dir: "scam", w: 0.08, evidence: "Fake-scarcity banner (\"only a few left\")" },
  no_contact_page: { dir: "scam", w: 0.12, evidence: "No contact or about page found" },
  no_refund_policy: { dir: "scam", w: 0.1, evidence: "No refund or returns policy" },
  brand_clone: { dir: "scam", w: 0.2, evidence: "Imitates a well-known brand" },
  risky_tld: { dir: "scam", w: 0.1, evidence: "Uses a top-level domain common in scams" },
  no_https: { dir: "scam", w: 0.15, evidence: "Page is not served over HTTPS" },
  too_good_discount: { dir: "scam", w: 0.15, evidence: "Discount is far too deep to be real" },
  allowlisted: { dir: "legit", w: 0.5, evidence: "Well-known retailer or bank" },
  domain_age_gt_365: { dir: "legit", w: 0.3, evidence: "Domain has existed for years" },
  has_contact_page: { dir: "legit", w: 0.1, evidence: "Has a contact page" },
  has_refund_policy: { dir: "legit", w: 0.1, evidence: "Clear refund and returns policy" },
  https_ok: { dir: "legit", w: 0.05, evidence: "Served over HTTPS" },
  // --- live site scan (bank transaction → merchant website) ---
  site_unreachable: { dir: "scam", w: 0.12, evidence: "Merchant website could not be reached" },
  redirects_offsite: { dir: "scam", w: 0.1, evidence: "Website redirects to an unrelated domain" },
  has_privacy_policy: { dir: "legit", w: 0.05, evidence: "Links to a privacy policy" },
  // --- charge signals ---
  exposure_link: { dir: "scam", w: 0.35, evidence: "Lines up with a risky site you entered info on" },
  card_test: { dir: "scam", w: 0.3, evidence: "Tiny first charge from a new merchant (card test)" },
  price_drift: { dir: "scam", w: 0.12, evidence: "Charge is much higher than this merchant's usual price" },
  duplicate_charge: { dir: "scam", w: 0.1, evidence: "Same merchant and amount charged twice within minutes" },
  new_subscription: { dir: "scam", w: 0.1, evidence: "Looks like a new subscription after a trial charge" },
  expected_charge: { dir: "legit", w: 0.4, evidence: "Matches a site you checked and rated OK" },
  known_merchant: { dir: "legit", w: 0.45, evidence: "You've paid this merchant before" },
  // --- message signals ---
  urgency_language: { dir: "scam", w: 0.15, evidence: "Pressure to act within hours" },
  threat_language: { dir: "scam", w: 0.15, evidence: "Threatens fines, suspension or legal action" },
  credential_request: { dir: "scam", w: 0.3, evidence: "Asks for a password, card number or other personal details" },
  small_fee_request: { dir: "scam", w: 0.2, evidence: "Asks for a fee to release a package, prize, job or refund" },
  lookalike_domain: { dir: "scam", w: 0.25, evidence: "Link uses a scam-prone domain or imitates a real company" },
  gift_card_request: { dir: "scam", w: 0.3, evidence: "Asks you to buy gift cards" },
  phone_callback: { dir: "scam", w: 0.2, evidence: "Tells you to call a number to cancel, dispute or unlock" },
  too_good_returns: { dir: "scam", w: 0.25, evidence: "Promises outsized returns" },
  secrecy_request: { dir: "scam", w: 0.15, evidence: "Asks you to keep it secret" },
  code_share_request: { dir: "scam", w: 0.35, evidence: "Asks you to send back a code texted to you" },
  payment_request: { dir: "scam", w: 0.25, evidence: "Asks you to send money by app, wire or link" },
  overpayment_refund: { dir: "scam", w: 0.25, evidence: "Claims an overpayment and wants money sent back" },
  unsolicited_investment: { dir: "scam", w: 0.2, evidence: "Unsolicited crypto or trading opportunity" },
  easy_money: { dir: "scam", w: 0.15, evidence: "Job pitch that promises easy money" },
  emergency_story: { dir: "scam", w: 0.15, evidence: "Crisis story used to rush you into helping" },
  stranger_contact: { dir: "scam", w: 0.12, evidence: "Unexpected contact from someone you haven't met" },
  no_ask: { dir: "legit", w: 0.25, evidence: "Doesn't ask for money, codes or personal details" },
  directs_to_official_channel: { dir: "legit", w: 0.2, evidence: "Points you to your card or the official app" },
  otp_notice: { dir: "legit", w: 0.35, evidence: "A one-time code with a warning never to share it" },
};

/** Evidence keys a message can produce (lib/rules/signals.ts messageKeys). */
export const MESSAGE_KEYS = [
  "urgency_language", "threat_language", "credential_request", "small_fee_request", "lookalike_domain", "gift_card_request", "phone_callback",
  "too_good_returns", "secrecy_request", "code_share_request", "payment_request", "overpayment_refund", "unsolicited_investment", "easy_money",
  "emergency_story", "stranger_contact", "too_good_discount", "gift_card_only", "countdown_timer", "no_ask", "directs_to_official_channel", "otp_notice",
] as const;

export function metaFor(key: string): KeyMeta | undefined { return KEYS[key]; }
