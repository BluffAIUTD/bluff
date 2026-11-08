import { describe, it, expect } from "vitest";
import { messageKeys } from "./signals";
import { computeConfidence, CONFIDENCE_MODEL } from "./confidence";
import { categorizeMessage, messageBasicCheck, messageNextSteps, withCategorySteps } from "./message";
import { KEYS, MESSAGE_KEYS } from "./weights";
import { VerdictSchema } from "../schemas";
import { TAXONOMY, TAXONOMY_BY_ID } from "../../data/taxonomy";

describe("message rules: no false credential requests", () => {
  it("a one-time code with a 'don't share it' warning is not a credential request", () => {
    for (const t of ["Your code is 123456. Don't share it with anyone.", "Acme: 482910 is your verification code. We will never ask for it. Do not share this code."]) {
      const k = messageKeys(t);
      expect(k).not.toContain("credential_request");
      expect(k).not.toContain("code_share_request");
      expect(k).toContain("otp_notice");
      expect(messageBasicCheck(t).verdict).toBe("looks_ok");
    }
  });
  it("a 'your password was changed' notice is not a credential request", () => {
    const t = "Your password was changed on Nov 7. If this wasn't you, open the official app and go to Settings > Security.";
    const k = messageKeys(t);
    expect(k).not.toContain("credential_request");
    expect(k).toContain("directs_to_official_channel");
    expect(messageBasicCheck(t).verdict).not.toBe("likely_scam");
  });
  it("still flags real asks: verify your password, text the code back", () => {
    expect(messageKeys("Your account is locked. Verify your password and card number at acct-verify.top")).toContain("credential_request");
    const steal = messageKeys("Hey, I sent my login code to your number by mistake, can you text it back?");
    expect(steal).toContain("code_share_request");
    expect(steal).not.toContain("otp_notice");
  });
  it("every key a message can produce has a weight", () => {
    for (const k of MESSAGE_KEYS) expect(KEYS[k], k).toBeDefined();
  });
});

describe("message rules: category passthrough (no longer always fake_store)", () => {
  const cases: [string, string][] = [
    ["Unpaid toll balance of $6.40. Pay within 24 hours to avoid a $50 penalty: tollpay-notice.top", "toll_scam"],
    ["USPS: your package is on hold. Pay the $1.99 redelivery fee at parcel-redeliver.info", "delivery_fee"],
    ["Hi, it's your manager. I'm in a meeting, buy 3 $100 gift cards and send me the codes asap. Keep this between us.", "gift_card_request"],
    ["Wrong number, sorry! Anyway my crypto mentor makes 20% weekly returns, want to join our private group?", "investment_crypto"],
  ];
  it.each(cases)("%s → %s", (text, cat) => {
    const v = messageBasicCheck(text);
    expect(v.verdict).toBe("likely_scam");
    expect(v.category).toBe(cat);
    expect(VerdictSchema.safeParse(v).success).toBe(true);
  });
  it("the scam category's own next steps reach the verdict", () => {
    const v = messageBasicCheck(cases[0][0]);
    expect(v.next_steps).toEqual(TAXONOMY_BY_ID.get("toll_scam")!.nextSteps.slice(0, 4));
    expect(v.next_steps.join(" ")).toMatch(/7726/);
  });
  it("a clean message gets a legit category and the categorizer always returns a scam and a legit guess", () => {
    expect(messageBasicCheck("Reminder: your dental cleaning is Tuesday at 3pm. Reply C to confirm.").category).toMatch(/^legit_/);
    expect(categorizeMessage("")).toEqual({ scam: "unclear", legit: "legit_personal" });
  });
  it("unsure verdicts get careful steps, not a category's", () => {
    expect(messageNextSteps("unsure", "toll_scam", "toll_scam")[0]).toMatch(/Don't click/);
    expect(messageNextSteps("likely_scam", "unclear")).toHaveLength(3);
  });
  it("withCategorySteps puts vetted steps first for a matching live verdict and leaves a mismatched one alone", () => {
    const base = messageBasicCheck(cases[0][0]);
    const live = { ...base, mode: "live" as const, next_steps: ["Block the sender"] };
    const out = withCategorySteps(live);
    expect(out.next_steps[0]).toBe(TAXONOMY_BY_ID.get("toll_scam")!.nextSteps[0]);
    expect(out.next_steps).toContain("Block the sender");
    expect(out.next_steps.length).toBeLessThanOrEqual(4);
    expect(withCategorySteps({ ...live, verdict: "looks_ok" }).next_steps).toEqual(["Block the sender"]);
  });
});

describe("honest confidence (calibrated on the train split)", () => {
  it("one weak signal (weight <= 0.15) reads below 70%; no single message signal reaches 90%", () => {
    const weak = MESSAGE_KEYS.filter((k) => KEYS[k].w <= 0.15);
    expect(weak.length).toBeGreaterThan(4);
    for (const k of weak) expect(computeConfidence([k]).confidence, k).toBeLessThan(0.7);
    for (const k of MESSAGE_KEYS) expect(computeConfidence([k]).confidence, k).toBeLessThan(0.9);
    expect(computeConfidence(["urgency_language"]).reason).toMatch(/hint, not proof/);
  });
  it("strong agreeing signals read high but never above the cap", () => {
    const c = computeConfidence(["credential_request", "lookalike_domain", "urgency_language", "threat_language"]);
    expect(c.confidence).toBeGreaterThanOrEqual(0.9);
    expect(c.confidence).toBeLessThanOrEqual(CONFIDENCE_MODEL.cap);
  });
  it("more agreeing evidence never lowers confidence; conflict lowers it", () => {
    const a = computeConfidence(["urgency_language"]).confidence;
    const b = computeConfidence(["urgency_language", "lookalike_domain"]).confidence;
    const c = computeConfidence(["urgency_language", "lookalike_domain", "credential_request"]).confidence;
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(computeConfidence(["lookalike_domain", "no_ask"]).confidence).toBeLessThan(computeConfidence(["lookalike_domain"]).confidence);
  });
  it("no evidence stays at the floor", () => {
    expect(computeConfidence([]).confidence).toBe(CONFIDENCE_MODEL.floor);
  });
});

describe("Bluff's taxonomy", () => {
  it("has the dataset's 17 scam + 8 legit ids, unique", () => {
    expect(TAXONOMY).toHaveLength(25);
    expect(new Set(TAXONOMY.map((t) => t.id)).size).toBe(25);
    expect(TAXONOMY.filter((t) => t.kind === "scam")).toHaveLength(17);
    expect(TAXONOMY.filter((t) => t.kind === "legit").every((t) => t.id.startsWith("legit_") && t.redFlags.length === 0)).toBe(true);
  });
  it("every red flag and cue is a weighted evidence key; next steps fit a verdict", () => {
    for (const t of TAXONOMY) {
      for (const k of [...t.redFlags, ...(t.cues ?? [])]) expect(KEYS[k], `${t.id}: ${k}`).toBeDefined();
      if (t.kind === "scam") expect(t.redFlags.length).toBeGreaterThan(0);
      expect(t.nextSteps.length).toBeGreaterThanOrEqual(2);
      expect(t.nextSteps.length).toBeLessThanOrEqual(4);
      for (const s of t.nextSteps) expect(s.length, s).toBeLessThanOrEqual(70);
    }
    expect(TAXONOMY_BY_ID.get("toll_scam")!.nextSteps.join(" ")).toMatch(/official toll site.*7726/);
  });
});
