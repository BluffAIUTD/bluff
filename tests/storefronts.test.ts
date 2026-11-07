import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STORES } from "../data/stores";
import { extractSignalsFromHtml, readStoreHtml } from "../lib/agent/tools/pageSignals";
import { pageKeys } from "../lib/rules/signals";
import { basicCheck } from "../lib/rules/basicCheck";

describe("demo storefronts", () => {
  it("all 8 exist and read through the same path the agent uses", () => {
    expect(STORES).toHaveLength(8);
    for (const s of STORES) expect(readStoreHtml(s.slug), s.slug).toContain("<html");
  });

  it("every page is labeled a demo, has a card field, and never submits or loads anything external", () => {
    for (const s of STORES) {
      const html = fs.readFileSync(path.join(process.cwd(), "stores", s.slug, "index.html"), "utf8");
      expect(html).toContain("Demo store, not real");
      expect(html).toMatch(/autocomplete="cc-number"/);
      expect(html).toContain("preventDefault");
      expect(html).not.toMatch(/<form[^>]*\saction=/i);
      expect(html).not.toMatch(/(src|href)="https?:\/\//i);
    }
  });

  it("extracted signals match each store's intended personality", () => {
    for (const s of STORES) {
      const sig = extractSignalsFromHtml(readStoreHtml(s.slug)!, s.slug);
      expect(sig.has_card_field).toBe(true);
      if (s.scam) expect(sig).toMatchObject({ countdown_timer: true, no_contact_page: true, no_refund_policy: true });
      else expect(sig).toMatchObject({ countdown_timer: false, no_contact_page: false, no_refund_policy: false, gift_card_or_crypto_only: false });
    }
    expect(extractSignalsFromHtml(readStoreHtml("fastkicks-shop")!, "fastkicks-shop")).toMatchObject({ gift_card_or_crypto_only: true, scarcity_banner: true, discount_pct: 85 });
  });

  it("8/8 classified correctly by the rules-only scorer using extracted signals + registry facts (P1 proof grid)", () => {
    const wrong: string[] = [];
    for (const s of STORES) {
      const sig = extractSignalsFromHtml(readStoreHtml(s.slug)!, s.slug);
      const v = basicCheck({ keys: pageKeys(sig, { ageDays: s.ageDays, brandCloneOf: s.brandCloneOf }) });
      if ((v.verdict === "likely_scam") !== s.scam) wrong.push(`${s.slug}:${v.verdict}:${v.score}`);
      if (s.scam) expect(v.score).toBeLessThan(40); else expect(v.score).toBeGreaterThanOrEqual(70);
    }
    expect(wrong).toEqual([]);
  });
});
