import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SITE_SLUGS, STORES } from "../data/stores";
import { extractSignalsFromHtml, readStoreHtml } from "../lib/agent/tools/pageSignals";
import { pageKeys } from "../lib/rules/signals";
import { basicCheck } from "../lib/rules/basicCheck";

const HIDDEN = new Set(["voltdeals-outlet", "cinevault-trial"]);

describe("demo storefronts", () => {
  it("all exist, and the scam ones are full multi-page websites", () => {
    expect(STORES).toHaveLength(10);
    for (const s of STORES) expect(readStoreHtml(s.slug), s.slug).toContain("<html");
    for (const slug of SITE_SLUGS) expect(STORES.find((s) => s.slug === slug)?.scam, slug).toBe(true);
  });

  it("every homepage is labeled a demo, has a card field, and never submits or loads anything external", () => {
    for (const s of STORES) {
      const html = fs.readFileSync(path.join(process.cwd(), "stores", s.slug, "index.html"), "utf8");
      expect(html).toContain("Demo store, not real");
      expect(html).toMatch(/autocomplete="cc-number"/);
      expect(html).toContain("preventDefault");
      expect(html).not.toMatch(/<form[^>]*\saction=/i);
      expect(html).not.toMatch(/(src|href)="https?:\/\//i);
    }
  });

  it("homepage signals match each store's personality", () => {
    for (const s of STORES) {
      const sig = extractSignalsFromHtml(readStoreHtml(s.slug)!, s.slug);
      expect(sig.has_card_field).toBe(true);
      if (!s.scam) expect(sig).toMatchObject({ countdown_timer: false, no_contact_page: false, no_refund_policy: false, gift_card_or_crypto_only: false });
      else if (!HIDDEN.has(s.slug)) expect(sig.countdown_timer, s.slug).toBe(true);
      else expect(sig).toMatchObject({ countdown_timer: false, gift_card_or_crypto_only: false }); // looks clean up front
    }
    expect(extractSignalsFromHtml(readStoreHtml("fastkicks-shop")!, "fastkicks-shop")).toMatchObject({ gift_card_or_crypto_only: true, scarcity_banner: true, discount_pct: 85 });
  });

  it("homepage-only rules catch the obvious scams but NOT the hidden ones (which is why the bank scan crawls the whole site)", () => {
    for (const s of STORES) {
      const sig = extractSignalsFromHtml(readStoreHtml(s.slug)!, s.slug);
      const v = basicCheck({ keys: pageKeys(sig, { ageDays: s.ageDays, brandCloneOf: s.brandCloneOf }) });
      if (!s.scam) expect(v.score, s.slug).toBeGreaterThanOrEqual(70);
      else if (HIDDEN.has(s.slug)) expect(v.verdict, s.slug).not.toBe("likely_scam");
      else expect(v.score, s.slug).toBeLessThan(40);
    }
  });
});
