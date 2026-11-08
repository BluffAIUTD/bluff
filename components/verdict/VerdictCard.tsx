import type { ReactNode } from "react";
import { VERDICT_TEXT, type Verdict } from "@/lib/schemas";
import { ModeBadge } from "../ui/ModeBadge";
import { ConfidencePill } from "./ConfidencePill";
import { EvidenceList } from "./EvidenceList";
import { NextSteps } from "./NextSteps";
import { ScoreDial } from "./ScoreDial";
import { toneForLabel } from "./tone";

const SEV_DOT: Record<string, string> = { high: "bg-scam", medium: "bg-unsure", low: "bg-gray-400", good: "bg-safe", info: "bg-accent" };
const SEV_LABEL: Record<string, string> = { high: "High risk", medium: "Medium", low: "Low", good: "Good sign", info: "Note" };
const pathOf = (p: string) => { try { return new URL(p).pathname; } catch { return p; } };

/**
 * The single verdict UI used by /check, the extension panel, and charge detail. Low-confidence results are shown as
 * Unsure with a "What to check yourself" list instead of red/green (product_spec §4).
 */
export function VerdictCard({ verdict, subtitle, actions, checkedEarlier }: { verdict: Verdict; subtitle?: string; actions?: ReactNode; checkedEarlier?: boolean }) {
  const lowConfidence = verdict.confidence < 0.5;
  const label = lowConfidence ? "unsure" : verdict.verdict;
  const tone = toneForLabel(label);
  const stepsTitle = lowConfidence || label === "unsure" ? "What to check yourself" : label === "likely_scam" ? "Do this instead" : "Good practice";
  // Nemotron's own read of the crawled site (page checks and bank-scan reviews); never shown on rules-only fallbacks.
  const analysis = verdict.mode === "live" || verdict.mode === "cached" ? verdict.analysis : undefined;
  const findings = (analysis?.findings ?? []).filter((f) => f.severity !== "info").slice(0, 6);
  return (
    <article aria-label="Verdict" className={`rounded-card border ${tone.border} ${tone.bg} p-4 sm:p-6`}>
      <div className="flex flex-wrap items-start gap-6">
        <ScoreDial score={verdict.score} />
        <div className="min-w-[200px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className={`font-grotesk text-2xl font-bold ${tone.text}`}>{VERDICT_TEXT[label]}</h2>
            <ModeBadge mode={verdict.mode} />
            {checkedEarlier && <span className="text-xs text-dim">checked earlier</span>}
          </div>
          {subtitle && <p className="mt-1 text-sm text-dim">{subtitle}</p>}
          <div className="mt-3"><ConfidencePill confidence={verdict.confidence} reason={verdict.confidence_reason} /></div>
        </div>
      </div>
      {analysis && (
        <section aria-label="AI site review" className="mt-5 rounded-control border border-line bg-surface p-3 sm:p-4">
          <h3 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">What Nemotron found on the site</h3>
          <p className="mt-1 text-[15px] leading-relaxed">{analysis.summary}</p>
          {findings.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1.5 text-sm">
              {findings.map((f, i) => (
                <li key={`${f.title}-${i}`} className="flex gap-2">
                  <span aria-label={SEV_LABEL[f.severity] ?? "Note"} title={SEV_LABEL[f.severity] ?? "Note"} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[f.severity] ?? SEV_DOT.info}`} />
                  <span className="min-w-0 break-words">{f.title}{f.page && <span className="font-mono text-xs text-dim"> · {pathOf(f.page)}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <EvidenceList items={verdict.evidence} score={verdict.score} />
        <NextSteps steps={verdict.next_steps} title={stepsTitle} />
      </div>
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </article>
  );
}
