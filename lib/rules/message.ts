import type { Verdict, VerdictLabel } from "../schemas";
import { TAXONOMY, TAXONOMY_BY_ID } from "../../data/taxonomy";
import { basicCheck } from "./basicCheck";
import { messageKeys } from "./signals";

/** Topic words per taxonomy category (rules-only categorization; the agent uses Nemotron embeddings when available). */
const TERMS: Record<string, RegExp> = {
  account_suspension: /\b(suspend\w*|deactivat\w*|lose access|on hold|restore (full )?access|billing (issue|verification|info)|payment (failure|failed|method)|could not be processed|auto-?renew(al)? failed|keep your (account|service) active|membership)\b/,
  bank_impersonation: /\b(bank|credit union|fraud (team|alert|department)|card ending|debit card|suspicious (charge|transaction|login|activity)|card (was )?declined|\bpin\b|mother'?s maiden name)\b/,
  delivery_fee: /\b(package|parcel|deliver\w*|shipment|courier|customs|tracking|address (correction|update))\b/,
  fake_store: /\b(\d+% off|sale|clearance|outlet|limited stock|items? left|designer|boutique|liquidation|deals?|order #?\d+)\b/,
  family_emergency: /\b(mom|dad|grandma|grandpa|mum|son|daughter|it'?s me|bail|detained|accident|new phone|new number|police)\b/,
  gift_card_request: /\bgift ?cards?\b/,
  government_impersonation: /\b(county|state|federal|court|tax|irs|benefits|jury|warrant|license|registration|motor vehicle|government|department|agency|lien)\b/,
  investment_crypto: /\b(crypto\w*|bitcoin|altcoins?|trading|invest\w*|portfolio|returns|profits|forex|signals|mentor)\b/,
  job_offer: /\b(job|hiring|position|role|resume|recruit\w*|remote|work from home|data entry|onboarding|staffing|per hour|\/hr)\b/,
  prize_giveaway: /\b(won|winner|congratulations|prize|reward|giveaway|randomly selected|chosen|loyalty bonus|survey|claim)\b/,
  refund_overpayment: /\b(overpaid|overpayment|refund|accidentally sent|by mistake|duplicate payment|excess)\b/,
  rental_deposit: /\b(rent|rental|apartment|lease|landlord|tenant|unit|\d ?br|cottage|loft|condo|listing|property|move in|keys)\b/,
  romance: /\b(dating|our connection|thinking (about|of) you|perfect together|our chats|special|miss you|met (in person|last)|profile|feel so|can'?t stop thinking)\b|[❤💔😘]/u,
  subscription_trap: /\b(subscription|auto-?renew\w*|renewal|premium|trial|invoice|cancel)\b/,
  tech_support: /\b(virus|malware|spyware|trojan|infected|antivirus|pc|computer|device|technicians?|registry|windows|scan)\b/,
  toll_scam: /\b(toll\w*|express lanes|transponder|turnpike)\b/,
  verification_code_theft: /\b((verification|security|login|one-time|\d-digit) code|otp|text (it|the code) back|read it back|code (to|on) your (number|phone))\b/,
  legit_account_notice: /\b(password|passcode|email|phone number) (was|has been)? ?(just |recently )?(changed|reset|updated)\b|\bnew (device|sign-?in)\b|\bsecurity settings\b/,
  legit_appointment: /\b(appointment|appt|scheduled|reminder|checkup|cleaning|reschedule|reply c\b)/,
  legit_bank_alert: /\b(deposit|balance|statement|card ending|transaction|withdrawal|credit union|bank|posted)\b/,
  legit_delivery: /\b(package|shipped|shipment|deliver\w*|in transit|track(ing)?|arriv\w*|courier|parcel)\b/,
  legit_marketing: /\b(\d+% off|sale|code [a-z0-9]+|unsubscribe|rewards?|deal|bogo|offer|promo)\b/,
  legit_otp: /\b(code|otp|passcode)\b[^.!?\n]{0,25}\b\d{4,8}\b|\b\d{4,8}\b[^.!?\n]{0,25}\b(code|otp)\b/,
  legit_personal: /\b(hey|lol|dinner|movies?|tonight|tomorrow|see you|love you|thanks|game|party|grab|pick (you|me) up)\b/,
  legit_transactional: /\b(order|receipt|confirmed|payment (of|received)|invoice|ready for pickup|purchase|renewed|has been received)\b/,
};

/** Topic words that name one category outright count double; small-talk words count half. */
const TERM_WEIGHT: Record<string, number> = { toll_scam: 2, legit_personal: 0.5 };

/** Evidence keys that point at a category (a key's own tactic beats topic words). */
const KEY_CATEGORY: Record<string, [string, number][]> = {
  code_share_request: [["verification_code_theft", 1.5]],
  gift_card_request: [["gift_card_request", 2]],
  overpayment_refund: [["refund_overpayment", 1.5]],
  unsolicited_investment: [["investment_crypto", 1.5]],
  too_good_returns: [["investment_crypto", 1]],
  easy_money: [["job_offer", 1.5]],
  emergency_story: [["family_emergency", 0.75], ["romance", 0.5]],
  stranger_contact: [["romance", 0.75], ["investment_crypto", 0.5]],
  secrecy_request: [["family_emergency", 0.5], ["gift_card_request", 0.5]],
  small_fee_request: [["delivery_fee", 0.5], ["prize_giveaway", 0.25], ["job_offer", 0.25]],
  phone_callback: [["subscription_trap", 0.5], ["tech_support", 0.5]],
  threat_language: [["account_suspension", 0.25], ["government_impersonation", 0.25]],
  credential_request: [["bank_impersonation", 0.5]],
  too_good_discount: [["fake_store", 1]], gift_card_only: [["fake_store", 1]], countdown_timer: [["fake_store", 0.5]],
  otp_notice: [["legit_otp", 2]],
  directs_to_official_channel: [["legit_account_notice", 0.25], ["legit_bank_alert", 0.25]],
};

export type CategoryScore = { category: string; score: number };

/** Ranks taxonomy categories for a message by topic words and evidence keys. Deterministic; no model. */
export function rankCategories(text: string, keys: string[] = messageKeys(text)): CategoryScore[] {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  const score = new Map<string, number>();
  const add = (c: string, s: number) => score.set(c, (score.get(c) ?? 0) + s);
  for (const [c, re] of Object.entries(TERMS)) {
    const hits = new Set((t.match(new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g")) ?? []).map((m) => m.trim())).size;
    if (hits) add(c, Math.min(3, hits) * (TERM_WEIGHT[c] ?? 1));
  }
  for (const k of keys) for (const [c, s] of KEY_CATEGORY[k] ?? []) add(c, s);
  return [...score.entries()].map(([category, s]) => ({ category, score: s })).sort((a, b) => b.score - a.score);
}

const SCAM_IDS = new Set(TAXONOMY.filter((t) => t.kind === "scam").map((t) => t.id));

/** Best scam and best legit category for a message (fallbacks when nothing matches). */
export function categorizeMessage(text: string, keys: string[] = messageKeys(text)): { scam: string; legit: string } {
  const ranked = rankCategories(text, keys);
  return {
    scam: ranked.find((r) => SCAM_IDS.has(r.category))?.category ?? "unclear",
    legit: ranked.find((r) => !SCAM_IDS.has(r.category))?.category ?? "legit_personal",
  };
}

/** Next steps for an unsure message verdict (before the user acts on it). */
export const MESSAGE_UNSURE_STEPS = ["Don't click links, reply or share codes yet", "Contact the sender through its official app or number", "Forward it to 7726 (SPAM) if you didn't expect it"];

/** Next steps for a likely-scam message whose category is unknown. */
export const MESSAGE_SCAM_STEPS = ["Don't click links, reply or call numbers in it", "Contact the company through its official app or number", "Forward the text to 7726 (SPAM), then delete it"];

/** Category-specific next steps for a message verdict: the scam category's steps, the legit category's, or careful steps. */
export function messageNextSteps(verdict: VerdictLabel, category: string, scamHint?: string): string[] {
  const own = TAXONOMY_BY_ID.get(category)?.nextSteps;
  if (verdict !== "unsure" && own) return own.slice(0, 4);
  if (verdict === "likely_scam") return MESSAGE_SCAM_STEPS;
  const hint = scamHint ? TAXONOMY_BY_ID.get(scamHint)?.nextSteps[0] : undefined;
  return [...new Set([MESSAGE_UNSURE_STEPS[0], ...(hint ? [hint] : []), ...MESSAGE_UNSURE_STEPS.slice(1)])].slice(0, 4);
}

/** Rules-only ("basic check") verdict for a message, with a taxonomy category and that category's next steps. */
export function messageBasicCheck(text: string): Verdict {
  const keys = messageKeys(text);
  const cat = categorizeMessage(text, keys);
  const v = basicCheck({ keys, scamCategory: cat.scam, legitCategory: cat.legit });
  return { ...v, next_steps: messageNextSteps(v.verdict, v.category, cat.scam) };
}

/**
 * A live message verdict keeps Nemotron's reasoning but gets the taxonomy's vetted next steps for its category first
 * (reporting to 7726, calling the number on the card...), then the model's own steps up to four.
 */
export function withCategorySteps(v: Verdict): Verdict {
  const own = TAXONOMY_BY_ID.get(v.category);
  if (!own) return v;
  const fits = (own.kind === "scam") === (v.verdict !== "looks_ok");
  if (!fits) return v;
  const steps = [...new Set([...own.nextSteps.slice(0, 3), ...v.next_steps])].slice(0, 4);
  return { ...v, next_steps: steps };
}
