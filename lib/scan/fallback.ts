import type { Db } from "../db";
import { basicCheck as rulesBasic } from "../rules/basicCheck";
import type { StepEvent, Verdict } from "../schemas";
import { basicVerdict } from "./basic";
import { loadSiteScan } from "./store";

/**
 * When the deep review can't run (no model, timeout, bad output), the site's verdict is its basic check: the same
 * crawl and registry facts, scored by rules, labeled BASIC CHECK. Never invents anything.
 */
export async function siteBasicFallback(db: Db, input: { scanId: string | null; host: string | null; merchant: string }): Promise<{ verdict: Verdict; steps: Omit<StepEvent, "seq">[] }> {
  const scan = input.scanId ? await loadSiteScan(db, input.scanId) : null;
  if (!scan) {
    const v = rulesBasic({ keys: ["site_unreachable"] });
    return { verdict: v, steps: [{ kind: "final", tool: "submit_verdict", inputSummary: "no crawl available", outputSummary: `${v.verdict} (basic check)`, ms: 0 }] };
  }
  const v = basicVerdict(scan.basic);
  return {
    verdict: v,
    steps: [
      { kind: "tool", tool: "basic_check", inputSummary: `${scan.crawl.pages.length} pages of ${input.host ?? input.merchant}`, outputSummary: `${scan.basic.findings.filter((f) => f.severity !== "info").length} findings, score ${scan.basic.score}`, ms: 0 },
      { kind: "final", tool: "submit_verdict", inputSummary: `score ${v.score}`, outputSummary: `${v.verdict} (rules only)`, ms: 0 },
    ],
  };
}
