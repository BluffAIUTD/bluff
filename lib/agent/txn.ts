import type { Db } from "../db";
import { one } from "../db";
import { findCandidates, type LinkCandidate } from "../linker";
import type { StepEvent, Verdict } from "../schemas";
import { basicCheck } from "../rules/basicCheck";
import { getTransactionWithFlags } from "../rules/flags";
import { domainIntel } from "./tools/domainIntel";
import { txnSearch } from "./tools/txnSearch";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const FIELD_LABEL: Record<string, string> = { card_number: "card", cvv: "card security code", ssn: "SSN", password: "password", phone: "phone number", dob: "date of birth", address: "address", email: "email", name: "name" };

export type TxnRules = {
  verdict: Verdict; steps: Omit<StepEvent, "seq">[]; candidates: LinkCandidate[]; best: LinkCandidate | null;
  descriptor: string; scriptId: string | null;
};

/**
 * Deterministic charge investigation over real data (txn_search → exposure_lookup → domain_intel). No model involved,
 * so the verdict is labeled "basic". Used by the mock runner and as the fallback when the live agent is unavailable.
 */
export async function txnRulesVerdict(db: Db, userId: string, txnId: string): Promise<TxnRules | null> {
  const row = await one<{ ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number; script_id: string | null }>(
    db, "SELECT ts, descriptor, descriptor_norm, amount_cents, script_id FROM transactions WHERE id=$1 AND user_id=$2", [txnId, userId],
  );
  if (!row) return null;
  const ctx = { userId, db, txnTs: row.ts };
  const steps: Omit<StepEvent, "seq">[] = [];
  const now = () => Date.now();

  steps.push({ kind: "plan", tool: null, inputSummary: clip(`Charge ${row.descriptor} ${money(row.amount_cents)}`, 70), outputSummary: "Plan: history → exposures → domain → verdict", ms: 5 });
  let t0 = now();
  const stats = await txnSearch({ descriptor_norm: row.descriptor_norm }, ctx);
  steps.push({
    kind: "tool", tool: "txn_search", inputSummary: clip(`${row.descriptor_norm || row.descriptor}, 90 days`, 70),
    outputSummary: stats.count ? `${stats.count} prior charges, avg ${money(stats.avg_cents)}` : "0 prior charges from this merchant", ms: now() - t0,
  });

  t0 = now();
  const link = await findCandidates(db, userId, { ts: row.ts, descriptor: row.descriptor, descriptorNorm: row.descriptor_norm });
  const best = link.best;
  steps.push({
    kind: "tool", tool: "exposure_lookup", inputSummary: clip(row.descriptor, 70),
    outputSummary: best ? `1 match: ${best.host}, ${best.days} days earlier, ${best.matchScore.toFixed(2)}${link.otherCount ? ` (+${link.otherCount} other)` : ""}` : "no matching exposure",
    ms: now() - t0,
  });

  let age: number | null = null;
  if (best) {
    t0 = now();
    const intel = await domainIntel(best.host, ctx);
    age = intel.age_days;
    steps.push({
      kind: "tool", tool: "domain_intel", inputSummary: clip(best.host, 70),
      outputSummary: age == null ? "age unknown" : `${age} days old${intel.brand_clone_of ? `, clones ${intel.brand_clone_of}` : ""}`, ms: now() - t0,
    });
  }

  const flags = (await getTransactionWithFlags(db, userId, txnId))?.flags ?? [];
  const keys: string[] = [];
  const evidence: string[] = [];
  let nextSteps = ["Check the charge in your bank's app", "Keep an eye out for repeat charges"];
  let scamCategory = "fake_store";
  let legitCategory = "legit_store";

  if (best && best.kind === "flagged") {
    keys.push("exposure_link");
    if (age != null && age < 30) keys.push("domain_age_lt_30");
    const fields = best.fieldTypes.map((f) => FIELD_LABEL[f] ?? f).join(", ");
    const when = best.days === 0 ? "the same day" : `${best.days} day${best.days === 1 ? "" : "s"} earlier`;
    evidence.push(`${money(row.amount_cents)} from ${row.descriptor} lines up with ${best.host}`);
    evidence.push(`You entered your ${fields || "info"} there ${when}`);
    evidence.push(age != null ? `That site was ${age} days old and scored ${best.exposureScore}` : `That site scored ${best.exposureScore}/100 when you checked it`);
    nextSteps = ["Call the number on your card to dispute", "Lock or replace the card", "Watch for repeat charges", "Change reused passwords"];
  } else if (best) {
    keys.push("expected_charge");
    evidence.push(`Matches ${best.host}, which you checked and rated OK`);
    scamCategory = "legit_store";
    nextSteps = ["No action needed", "Keep your receipt"];
  } else {
    evidence.push("No site in your Exposure Log explains this charge");
  }
  if (flags.includes("card_test")) {
    keys.push("card_test"); scamCategory = "card_testing";
    nextSteps = ["Ask your bank to block this merchant", "Watch for bigger charges soon", "Consider replacing the card"];
  }
  if (flags.includes("price_drift")) {
    keys.push("price_drift"); scamCategory = "price_drift";
    evidence.push(`Much higher than the usual ${money(stats.avg_cents)} from this merchant`);
    nextSteps = ["Check the plan price on the merchant's site", "Ask the merchant why the price changed"];
  }
  if (flags.includes("duplicate")) {
    keys.push("duplicate_charge");
    nextSteps = ["Ask the merchant to refund the duplicate", "Dispute it if they don't"];
  }
  if (flags.includes("new_subscription")) keys.push("new_subscription");
  if (!best && !flags.some((f) => f !== "new_subscription") && stats.count >= 3) {
    keys.push("known_merchant");
    evidence.push(`${stats.count} earlier charges from this merchant`);
    nextSteps = ["No action needed", "Keep your receipt"];
    legitCategory = "known_merchant";
  }

  const verdict = basicCheck({ keys, extraEvidence: evidence, scamCategory, legitCategory, nextSteps });
  verdict.linked = best
    ? { exposure_id: best.exposureId, txn_id: txnId, match_reasons: best.reasons, kind: best.kind }
    : { txn_id: txnId };
  steps.push({ kind: "final", tool: "submit_verdict", inputSummary: `score ${verdict.score}`, outputSummary: `${verdict.verdict} (${Math.round(verdict.confidence * 100)}% sure)`, ms: 3 });
  return { verdict, steps, candidates: link.candidates, best, descriptor: row.descriptor, scriptId: row.script_id };
}
