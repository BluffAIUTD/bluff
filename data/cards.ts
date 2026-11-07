/** 15 hand-written game cards (product_spec P4). All brands are fictional. Flag spans must appear verbatim in the card text. */
export type CardSeed = {
  kind: "text" | "checkout" | "email" | "receipt" | "bank_alert";
  content: { from?: string; subject?: string; body: string };
  isScam: boolean; category: string;
  redFlags: { span: string; why: string }[];
};

export const CARD_SEEDS: CardSeed[] = [
  { kind: "text", isScam: true, category: "delivery_fee", content: { from: "+1 (415) 555-0133", body: "Parcelo: Your package is held. Pay $1.99 redelivery fee within 12 hrs: parcelo-redeliver.help/pay" },
    redFlags: [{ span: "Pay $1.99 redelivery fee", why: "Real carriers don't charge small fees by text" }, { span: "within 12 hrs", why: "Fake deadline to rush you" }, { span: "parcelo-redeliver.help", why: "Lookalike domain, not the carrier's own" }] },
  { kind: "text", isScam: true, category: "toll_scam", content: { from: "+1 (737) 555-0170", body: "TollTag final notice: unpaid toll $8.40. Avoid $50 fine, pay now: tolltag-pay.top/tx" },
    redFlags: [{ span: "final notice", why: "Threat language to create panic" }, { span: "Avoid $50 fine", why: "Invented penalty to push a quick payment" }, { span: "tolltag-pay.top", why: ".top domain that isn't the toll agency's site" }] },
  { kind: "bank_alert", isScam: true, category: "bank_impersonation", content: { from: "Northbank Alerts", body: "Northbank ALERT: suspicious login. Verify your card number and PIN at northbank-secure.co to keep your account open." },
    redFlags: [{ span: "Verify your card number and PIN", why: "Banks never ask for your PIN by text" }, { span: "northbank-secure.co", why: "Not the bank's real domain" }] },
  { kind: "checkout", isScam: true, category: "fake_store", content: { subject: "Retro Runner Sale", body: "Retro Runner Sale 85% OFF! Only 3 left. Pay with gift card or crypto only. Offer ends in 09:59" },
    redFlags: [{ span: "85% OFF", why: "Too good to be true for a brand-name shoe" }, { span: "gift card or crypto only", why: "Untraceable payment methods are a scam signature" }, { span: "Offer ends in 09:59", why: "Countdown timer pressure" }] },
  { kind: "email", isScam: true, category: "prize_giveaway", content: { subject: "You won a $500 gift card!", body: "Claim within 24 hours. Just confirm your SSN and a $4.95 shipping fee." },
    redFlags: [{ span: "Claim within 24 hours", why: "Artificial urgency" }, { span: "confirm your SSN", why: "A prize never needs your Social Security number" }, { span: "$4.95 shipping fee", why: "Small fee is how they get your card" }] },
  { kind: "text", isScam: true, category: "gift_card_request", content: { from: "+1 (214) 555-0188", body: "Hi it's Alex, new number! Can you buy 4 gift cards for my boss? I'll pay you back, don't tell anyone." },
    redFlags: [{ span: "new number", why: "Impersonators start with a number change" }, { span: "buy 4 gift cards", why: "Gift cards are the classic untraceable ask" }, { span: "don't tell anyone", why: "Secrecy stops you from checking" }] },
  { kind: "email", isScam: true, category: "account_suspension", content: { from: "support@meadowpay-verify.net", subject: "Account suspension notice", body: "Your MeadowPay account will be suspended in 24 hours unless you re-enter your password: meadowpay-verify.net" },
    redFlags: [{ span: "suspended in 24 hours", why: "Deadline pressure" }, { span: "re-enter your password", why: "Legit services never ask for your password by email" }, { span: "meadowpay-verify.net", why: "Not the company's real domain" }] },
  { kind: "receipt", isScam: true, category: "tech_support", content: { subject: "Receipt: Antivirus Pro", body: "Receipt: Antivirus Pro renewal $389.99. Not you? Call 1-800-555-0142 to cancel now." },
    redFlags: [{ span: "$389.99", why: "Big unexpected charge to alarm you" }, { span: "Call 1-800-555-0142", why: "A phone number in the receipt leads to a scammer, not a refund" }] },
  { kind: "text", isScam: true, category: "investment", content: { from: "+1 (469) 555-0102", body: "Hot tip: my mentor turned $200 into $4,000 in a week with CoinBloom. DM me to join, spots close tonight." },
    redFlags: [{ span: "$200 into $4,000", why: "Guaranteed-style returns don't exist" }, { span: "spots close tonight", why: "Pressure to act before thinking" }] },
  { kind: "text", isScam: false, category: "legit_transactional", content: { from: "Bayou Bakery", body: "Bayou Bakery: your order #2281 is ready for pickup until 6 PM today." }, redFlags: [] },
  { kind: "bank_alert", isScam: false, category: "legit_transactional", content: { from: "Northbank", body: "Northbank: A $42.10 purchase at Greenleaf Grocer was approved on your card ending 4417. If this wasn't you, call the number on the back of your card." }, redFlags: [] },
  { kind: "email", isScam: false, category: "legit_transactional", content: { from: "orders@lonestar-tickets.example", subject: "Your Lonestar Tickets order", body: "Your Lonestar Tickets order: 2 tickets for Saturday. Open the app to view them. No action needed." }, redFlags: [] },
  { kind: "receipt", isScam: false, category: "legit_transactional", content: { subject: "Receipt - Campus Tech", body: "Receipt - Campus Tech: USB-C cable $12.99, paid with card ending 4417. Returns accepted within 30 days at the store." }, redFlags: [] },
  { kind: "text", isScam: false, category: "legit_transactional", content: { from: "Elm Street Dental", body: "Reminder: dentist appointment tomorrow 3:30 PM at Elm Street Dental. Reply C to confirm." }, redFlags: [] },
  { kind: "checkout", isScam: false, category: "legit_store", content: { subject: "Northloop Books checkout", body: "Northloop Books checkout. Total $23.50. Pay with card or PayPal. Free returns within 30 days. Contact: help@northloop-books.example" }, redFlags: [] },
];
