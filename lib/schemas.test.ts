import { describe, it, expect } from "vitest";
import { VerdictSchema, verdictLabel, MessageInvestigateSchema, ExposureCreateSchema } from "./schemas";
import { errorBody } from "./errors";

const good = {
  score: 18, verdict: "likely_scam", confidence: 0.82, confidence_reason: "Several strong signals agree",
  category: "fake_store", evidence: ["Site is 4 days old", "Only takes gift cards", "Copies a real brand"],
  evidence_keys: ["domain_age_lt_30", "gift_card_only"], next_steps: ["Leave this site", "Use a known retailer"], mode: "live",
};

describe("VerdictSchema", () => {
  it("accepts a valid verdict and defaults linked", () => {
    const v = VerdictSchema.parse(good);
    expect(v.linked).toEqual({});
  });
  it("rejects out-of-range and malformed fields", () => {
    expect(VerdictSchema.safeParse({ ...good, score: 101 }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, score: 18.5 }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, evidence: ["only", "two"] }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, evidence: ["a", "b", "x".repeat(91)] }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, next_steps: ["one"] }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, confidence_reason: "x".repeat(121) }).success).toBe(false);
    expect(VerdictSchema.safeParse({ ...good, mode: "demo" }).success).toBe(false);
  });
});

describe("verdictLabel boundaries", () => {
  it.each([[0, "likely_scam"], [39, "likely_scam"], [40, "unsure"], [69, "unsure"], [70, "looks_ok"], [100, "looks_ok"]])("%i → %s", (s, l) => {
    expect(verdictLabel(s)).toBe(l);
  });
});

describe("inputs and error shape", () => {
  it("limits message length to 2000", () => {
    expect(MessageInvestigateSchema.safeParse({ text: "a".repeat(2001) }).success).toBe(false);
    expect(MessageInvestigateSchema.parse({ text: "hi" }).source).toBe("check");
  });
  it("validates exposure action", () => {
    expect(ExposureCreateSchema.safeParse({ verdictId: "v", url: "https://x", host: "x", action: "nope" }).success).toBe(false);
  });
  it("error body matches spec shape", () => {
    expect(errorBody("timeout", "slow")).toEqual({ error: { code: "timeout", message: "slow" } });
  });
});
