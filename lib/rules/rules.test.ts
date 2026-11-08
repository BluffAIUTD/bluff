import { describe, it, expect } from "vitest";
import { computeConfidence } from "./confidence";
import { basicCheck, scoreFromKeys } from "./basicCheck";
import { VerdictSchema } from "../schemas";
import { messageKeys, pageKeys, extractUrls } from "./signals";
import { CARD_SEEDS } from "../../data/cards";

describe("computeConfidence (§6.4)", () => {
  it("strong agreeing signals approach the 0.95 cap and never exceed it", () => {
    const r = computeConfidence(["domain_age_lt_30", "gift_card_only", "countdown_timer", "brand_clone"]);
    // S = 0.87, agreement 1 → 0.35 + 0.6·(1 − e^(−0.87/0.18)) ≈ 0.946 → 0.95 (the cap; was 0.97 before calibration)
    expect(r.confidence).toBe(0.95);
  });
  it("no signals → 0.35, with an honest reason", () => {
    const r = computeConfidence([]);
    expect(r.confidence).toBe(0.35);
    expect(r.reason).toMatch(/guess/);
  });
  it("conflicting signals lower agreement and the reason names the conflict", () => {
    const r = computeConfidence(["allowlisted", "domain_age_lt_30"]);
    expect(r.confidence).toBeLessThan(0.7);
    expect(r.reason).toMatch(/Mixed signals/);
    expect(r.reason.length).toBeLessThanOrEqual(120);
  });
  it("ignores unknown keys and duplicates", () => {
    expect(computeConfidence(["gift_card_only", "gift_card_only", "nope"]).coverage).toBe(0.25);
  });
});

const FAST = { gift_card_or_crypto_only: true, countdown_timer: true, scarcity_banner: true, no_contact_page: true, no_refund_policy: true, brand_words_in_title: true, https: true, discount_pct: 85 };
const LEGIT = { no_contact_page: false, no_refund_policy: false, https: true };

describe("basicCheck (§6.6)", () => {
  it("scam storefront scores < 40 and validates", () => {
    const v = basicCheck({ keys: pageKeys(FAST, { ageDays: 4, brandCloneOf: "x" }) });
    expect(VerdictSchema.safeParse(v).success).toBe(true);
    expect(v.score).toBeLessThan(40);
    expect(v.verdict).toBe("likely_scam");
    expect(v.mode).toBe("basic");
  });
  it("established legit storefront scores ≥ 70", () => {
    const v = basicCheck({ keys: pageKeys(LEGIT, { ageDays: 2190 }) });
    expect(VerdictSchema.safeParse(v).success).toBe(true);
    expect(v.score).toBeGreaterThanOrEqual(70);
    expect(v.verdict).toBe("looks_ok");
  });
  it("no signals → unsure, score in 40–69, still a valid verdict with ≥3 evidence lines", () => {
    const v = basicCheck({ keys: [] });
    expect(VerdictSchema.safeParse(v).success).toBe(true);
    expect(v.verdict).toBe("unsure");
    expect(v.score).toBeGreaterThanOrEqual(40);
    expect(v.score).toBeLessThanOrEqual(69);
  });
  it("low-confidence verdicts are forced to unsure", () => {
    const v = basicCheck({ keys: ["allowlisted", "domain_age_lt_30", "gift_card_only"] });
    expect(v.confidence).toBeLessThan(0.7);
    if (v.confidence < 0.5) expect(v.verdict).toBe("unsure");
  });
  it("score is monotone: more scam keys never raise it", () => {
    const a = scoreFromKeys(["gift_card_only"]);
    const b = scoreFromKeys(["gift_card_only", "domain_age_lt_30"]);
    expect(b).toBeLessThanOrEqual(a);
  });
});

describe("messageKeys heuristics", () => {
  const scam = CARD_SEEDS.filter((c) => c.isScam);
  const legit = CARD_SEEDS.filter((c) => !c.isScam);
  const text = (c: (typeof CARD_SEEDS)[number]) => [c.content.subject, c.content.body].filter(Boolean).join(" ");
  it("flags every hand-written scam card with at least one scam key", () => {
    for (const c of scam) {
      const keys = messageKeys(text(c));
      expect(keys.some((k) => k !== "no_ask" && k !== "directs_to_official_channel"), text(c)).toBe(true);
    }
  });
  it("basic check separates the 15 seeded cards at ≥ 80% accuracy (sanity, not a claim)", () => {
    let right = 0;
    for (const c of CARD_SEEDS) {
      const v = basicCheck({ keys: messageKeys(text(c)) });
      if ((v.verdict !== "looks_ok") === c.isScam) right++;
    }
    expect(right / CARD_SEEDS.length).toBeGreaterThanOrEqual(0.8);
    expect(legit.length).toBe(6);
  });
  it("extracts urls", () => {
    expect(extractUrls("pay at parcelo-redeliver.help/pay now")).toContain("parcelo-redeliver.help/pay");
  });
});
