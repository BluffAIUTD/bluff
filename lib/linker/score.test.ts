import { describe, it, expect } from "vitest";
import { normalizeDescriptor, labelFromHost } from "./normalize";
import { nameScore, abbreviationScore, timeScore, linkScore, trigramSimilarity, LINK_THRESHOLD } from "./score";

describe("normalizeDescriptor", () => {
  it.each([
    ["FKSHP*LLC", "fkshp"],
    ["TST* QWKPAY", "qwkpay"],
    ["SQ *BAYOU BAKERY 4411", "bayou bakery"],
    ["PAYPAL *NORTHLOOP BOOKS", "northloop books"],
    ["SP *CAMPUSTECH INC", "campustech"],
    ["PP*LONESTAR-TICKETS", "lonestar tickets"],
    ["", ""],
    ["12345", ""],
    ["SQ *", ""],
  ])("%s → %s", (raw, want) => expect(normalizeDescriptor(raw)).toBe(want));
});

describe("labelFromHost", () => {
  it("extracts registrable label", () => {
    expect(labelFromHost("fastkicks-shop.bluff.example.com", "bluff.example.com")).toBe("fastkicks-shop");
    expect(labelFromHost("https://www.fastkicks-shop.com/checkout")).toBe("fastkicks-shop");
    expect(labelFromHost("shop.example.co.uk")).toBe("example");
    expect(labelFromHost("localhost")).toBe("localhost");
  });
});

describe("name scoring", () => {
  it("abbreviation: fkshp ⊂ fastkicks-shop", () => {
    expect(abbreviationScore("fkshp", "fastkicks-shop")).toBe(0.85);
    expect(abbreviationScore("fast", "fastkicks-shop")).toBe(0); // does not reach the 's' of shop
    expect(abbreviationScore("zz", "fastkicks-shop")).toBe(0);
    expect(abbreviationScore("kicksshop", "fastkicks-shop")).toBe(0); // wrong first letter
    expect(abbreviationScore("fastkicksshop", "fastkicks-shop")).toBe(0.85);
    expect(abbreviationScore("fkshp", "fastkicks")).toBe(0); // missing the second token
  });
  it("trigram is symmetric and bounded", () => {
    expect(trigramSimilarity("bayou bakery", "bayou bakery")).toBe(1);
    expect(trigramSimilarity("abc", "xyz")).toBe(0);
    expect(trigramSimilarity("", "x")).toBe(0);
  });
  it("picks the best method", () => {
    expect(nameScore("fkshp", "fastkicks-shop").method).toBe("abbreviation");
    expect(nameScore("bayou bakery", "bayou-bakery").score).toBe(1);
  });
});

describe("timeScore", () => {
  const e = new Date("2026-11-01T12:00:00Z");
  const at = (d: number) => new Date(e.getTime() + d * 86_400_000);
  it("windows and decay", () => {
    expect(timeScore(e, at(-0.01))).toBeNull(); // charge before exposure
    expect(timeScore(e, at(0))).toBe(1);
    expect(timeScore(e, at(7))).toBe(1);
    expect(timeScore(e, at(45))).toBeCloseTo(0.3, 5);
    expect(timeScore(e, at(45.5))).toBeNull();
    expect(timeScore(e, at(26))).toBeCloseTo(0.65, 2);
  });
});

describe("linkScore", () => {
  const e = new Date("2026-11-04T10:00:00Z");
  const t = new Date("2026-11-07T10:00:00Z");
  it("links FKSHP*LLC to fastkicks-shop with reasons", () => {
    const r = linkScore({ descriptor: "FKSHP*LLC", descriptorNorm: normalizeDescriptor("FKSHP*LLC"), label: "fastkicks-shop", exposureAt: e, txnAt: t })!;
    expect(r.score).toBeGreaterThanOrEqual(LINK_THRESHOLD);
    expect(r.reasons[0]).toContain("abbreviates");
    expect(r.reasons[1]).toBe("charged 3 days after exposure");
  });
  it("shared word with a different site stays below the threshold (hard negative)", () => {
    const r = linkScore({ descriptor: "SHOP N SAVE", descriptorNorm: normalizeDescriptor("SHOP N SAVE"), label: "fastkicks-shop", exposureAt: e, txnAt: t })!;
    expect(r.score).toBeLessThan(LINK_THRESHOLD);
  });
  it("never links a charge before the exposure; watch adds 0.1", () => {
    expect(linkScore({ descriptor: "X", descriptorNorm: "x", label: "x", exposureAt: t, txnAt: e })).toBeNull();
    const a = linkScore({ descriptor: "FKSHP", descriptorNorm: "fkshp", label: "fastkicks-shop", exposureAt: e, txnAt: t })!;
    const b = linkScore({ descriptor: "FKSHP", descriptorNorm: "fkshp", label: "fastkicks-shop", exposureAt: e, txnAt: t, watch: true })!;
    expect(b.score - a.score).toBeCloseTo(0.1, 5);
  });
  it("empty descriptor yields no name evidence", () => {
    const r = linkScore({ descriptor: "", descriptorNorm: "", label: "fastkicks-shop", exposureAt: e, txnAt: t })!;
    expect(r.name.score).toBe(0);
    expect(r.score).toBeLessThan(LINK_THRESHOLD);
  });
});
