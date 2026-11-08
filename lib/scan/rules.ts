import type { Db } from "../db";
import { basicCheck } from "../rules/basicCheck";
import { pageKeys } from "../rules/signals";
import type { StepEvent, Verdict } from "../schemas";
import { domainIntel } from "../agent/tools/domainIntel";
import { txnSearch } from "../agent/tools/txnSearch";
import { scrapeSite, type ScrapeResult } from "./scrape";
import { resolveWebsite } from "./website";

export type SiteInput = { userId: string; txnId: string; host: string | null; merchant: string; descriptor: string; ts?: Date };

/** Evidence keys from a scrape + domain intel. Shared by the rules-only path and by tests. */
export function siteKeys(s: ScrapeResult | null, intel: { age_days: number | null; allowlisted: boolean; brand_clone_of: string | null; tld_risk: boolean } | null, priorCharges: number): string[] {
  const keys: string[] = [];
  if (!s || !s.fetched) keys.push("site_unreachable");
  else {
    const sig = s.bot_blocked ? { https: s.signals.https } : s.signals;
    keys.push(...pageKeys(sig, { ageDays: intel?.age_days ?? null, brandCloneOf: intel?.brand_clone_of, allowlisted: intel?.allowlisted }));
    if (s.redirected_offsite) keys.push("redirects_offsite");
    if (s.has_privacy_policy) keys.push("has_privacy_policy");
  }
  if ((!s || !s.fetched) && intel) keys.push(...pageKeys({}, { ageDays: intel.age_days, brandCloneOf: intel.brand_clone_of, allowlisted: intel.allowlisted }));
  if (intel?.tld_risk) keys.push("risky_tld");
  if (priorCharges >= 2) keys.push("known_merchant");
  // Big established sites rarely put refund text on the homepage: don't count that against them.
  const established = keys.includes("allowlisted") || keys.includes("domain_age_gt_365");
  return [...new Set(keys)].filter((k) => !(established && k === "no_refund_policy"));
}

/** Rules-only verdict over the real website (no model): resolve → scrape → domain intel → history → basic check. */
export async function siteRulesVerdict(db: Db, input: SiteInput): Promise<{ verdict: Verdict; steps: Omit<StepEvent, "seq">[] }> {
  const steps: Omit<StepEvent, "seq">[] = [];
  let t = Date.now();
  steps.push({ kind: "plan", tool: null, inputSummary: `Charge ${input.descriptor}`.slice(0, 70), outputSummary: "Plan (rules only): website → scrape → domain → history → verdict", ms: 0 });
  const site = input.host ? { host: input.host, how: "statement" as const } : await resolveWebsite({ merchant: input.merchant, descriptor: input.descriptor });
  steps.push({ kind: "tool", tool: "resolve_website", inputSummary: input.merchant.slice(0, 70), outputSummary: site.host ? `${site.host} (${site.how})` : "no website found", ms: Date.now() - t });
  let scrape: ScrapeResult | null = null;
  let intel: Awaited<ReturnType<typeof domainIntel>> | null = null;
  if (site.host) {
    t = Date.now();
    scrape = await scrapeSite(site.host);
    steps.push({ kind: "tool", tool: "scrape_site", inputSummary: site.host, outputSummary: scrape.fetched ? `${scrape.status} ${scrape.title || "(no title)"}`.slice(0, 100) : `failed: ${scrape.error}`, ms: Date.now() - t });
    t = Date.now();
    intel = await domainIntel(scrape.fetched ? scrape.final_host : site.host, { userId: input.userId, db });
    steps.push({ kind: "tool", tool: "domain_intel", inputSummary: site.host, outputSummary: intel.age_days == null ? "age unknown" : `${intel.age_days} days old${intel.allowlisted ? ", allowlisted" : ""}`, ms: Date.now() - t });
  }
  t = Date.now();
  const hist = await txnSearch({ descriptor_norm: input.descriptor, days: 120 }, { userId: input.userId, db, txnTs: input.ts });
  steps.push({ kind: "tool", tool: "txn_search", inputSummary: input.descriptor.slice(0, 70), outputSummary: `${hist.count} prior charges`, ms: Date.now() - t });
  const keys = siteKeys(scrape, intel, hist.count);
  const verdict = basicCheck({ keys, scamCategory: "fake_store", legitCategory: "known_merchant" });
  steps.push({ kind: "final", tool: "submit_verdict", inputSummary: `score ${verdict.score}`, outputSummary: `${verdict.verdict} (${Math.round(verdict.confidence * 100)}% sure)`, ms: 1 });
  return { verdict, steps };
}
