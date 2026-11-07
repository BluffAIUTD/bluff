/**
 * PLACEHOLDER taxonomy. The real T-Mobile scam taxonomy has not been provided yet (hackathon.md [U]).
 * Rows are flagged is_placeholder=true; replace via db/seed when the booth data arrives.
 */
export type TaxonomySeed = { id: string; name: string; description: string; examples: string[]; redFlags: string[] };

export const TAXONOMY: TaxonomySeed[] = [
  { id: "fake_store", name: "Fake online store", description: "A too-good-to-be-true shop that takes payment and never delivers", examples: ["85% off sneakers, gift cards only"], redFlags: ["domain_age_lt_30", "gift_card_only", "countdown_timer", "brand_clone"] },
  { id: "delivery_fee", name: "Delivery fee scam", description: "A fake carrier asks for a small redelivery fee to steal card details", examples: ["Pay $1.99 to reschedule your package"], redFlags: ["small_fee", "urgency", "lookalike_domain"] },
  { id: "toll_scam", name: "Toll scam", description: "A fake toll agency threatens fines for an unpaid balance", examples: ["Final notice: unpaid toll"], redFlags: ["threat", "lookalike_domain"] },
  { id: "bank_impersonation", name: "Bank impersonation", description: "A fake bank alert asks for credentials or PIN", examples: ["Verify your card number and PIN"], redFlags: ["credential_request", "lookalike_domain"] },
  { id: "prize_giveaway", name: "Prize / giveaway", description: "You won something; pay a fee or share sensitive info to claim", examples: ["You won a $500 gift card"], redFlags: ["urgency", "ssn_request", "small_fee"] },
  { id: "gift_card_request", name: "Gift card request", description: "Someone you know asks for gift cards", examples: ["Hi it's Alex, new number"], redFlags: ["new_number", "gift_card_request", "secrecy"] },
  { id: "account_suspension", name: "Account suspension", description: "Your account will be closed unless you log in through a link", examples: ["Re-enter your password in 24 hours"], redFlags: ["urgency", "credential_request", "lookalike_domain"] },
  { id: "tech_support", name: "Tech support refund", description: "A fake receipt pushes you to call a scammer's number", examples: ["Antivirus renewal $389.99, call to cancel"], redFlags: ["big_charge", "phone_number"] },
  { id: "investment", name: "Investment / crypto", description: "Promised outsized returns with pressure to join", examples: ["$200 into $4,000 in a week"], redFlags: ["guaranteed_returns", "urgency"] },
  { id: "legit_transactional", name: "Legitimate notice", description: "Order, appointment or bank notices with no ask for secrets", examples: ["Your order is ready for pickup"], redFlags: [] },
  { id: "legit_store", name: "Legitimate store", description: "An established store with a contact page and refund policy", examples: ["Free returns within 30 days"], redFlags: [] },
];
