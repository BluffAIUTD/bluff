import type { ReactNode } from "react";
import { VERDICT_TEXT, type Verdict } from "@/lib/schemas";
import { ModeBadge } from "../ui/ModeBadge";
import { ConfidencePill } from "./ConfidencePill";
import { EvidenceList } from "./EvidenceList";
import { NextSteps } from "./NextSteps";
import { ScoreDial } from "./ScoreDial";
import { toneForLabel } from "./tone";

const SEV_DOT: Record<string, string> = { high: "bg-scam", medium: "bg-unsure", low: "bg-gray-4", good: "bg-safe", info: "bg-accent" };
const SEV_LABEL: Record<string, string> = { high: "High risk", medium: "Medium", low: "Low", good: "Good sign", info: "Note" };
const pathOf = (p: string) => { try { return new URL(p).pathname; } catch { return p; } };

/**
 * The single verdict UI used by /check, the extension panel, and charge detail. Low-confidence results are shown as
 * Unsure with a "What to check yourself" list instead of red/green (product_spec §4).
 */
export function VerdictCard({ verdict, subtitle, actions, checkedEarlier, animate = true, exhibitFrom = 0 }: { verdict: Verdict; subtitle?: string; actions?: ReactNode; checkedEarlier?: boolean; animate?: boolean; exhibitFrom?: number }) {
  const lowConfidence = verdict.confidence < 0.5;
  const label = lowConfidence ? "unsure" : verdict.verdict;
  const tone = toneForLabel(label);
  const stepsTitle = lowConfidence || label === "unsure" ? "What to check yourself" : label === "likely_scam" ? "Do this instead" : "Good practice";
  // Nemotron's own read of the crawled site (page checks and bank-scan reviews); never shown on rules-only fallbacks.
  const analysis = verdict.mode === "live" || verdict.mode === "cached" ? verdict.analysis : undefined;
  const findings = (analysis?.findings ?? []).filter((f) => f.severity !== "info").slice(0, 6);
  return (
    <article aria-label="Verdict" className={`dossier relative border-t-[5px] ${tone.border} ${tone.bg} p-5 sm:p-7`} style={{ borderTopColor: tone.stroke }}>
      <div className="flex flex-wrap items-start gap-x-8 gap-y-5">
        <ScoreDial score={verdict.score} animate={animate} />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="eyebrow">Verdict</span>
            <ModeBadge mode={verdict.mode} />
            {checkedEarlier && <span className="font-mono text-xs text-dim">checked earlier</span>}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
            <h2 className={`font-display text-4xl font-semibold leading-none sm:text-5xl ${tone.text}`}>{VERDICT_TEXT[label]}</h2>
            <span aria-hidden className={`stamp ${tone.text} ${animate ? "stamp-press" : ""}`}>{VERDICT_TEXT[label]}</span>
          </div>
          {subtitle && <p className="mt-2 break-all font-mono text-sm text-dim">{subtitle}</p>}
          <div className="mt-4"><ConfidencePill confidence={verdict.confidence} reason={verdict.confidence_reason} /></div>
        </div>
      </div>
      {analysis && (
        <section aria-label="AI site review" className="mt-7 border-y border-line py-5">
          <h3 className="eyebrow">What Nemotron found on the site</h3>
          <blockquote className="mt-3 font-display text-[22px] italic leading-[1.35] sm:text-[26px]"><span aria-hidden className="mr-1 text-scam">&ldquo;</span>{analysis.summary}</blockquote>
          {findings.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 text-sm">
              {findings.map((f, i) => (
                <li key={`${f.title}-${i}`} className="flex gap-2">
                  <span aria-label={SEV_LABEL[f.severity] ?? "Note"} title={SEV_LABEL[f.severity] ?? "Note"} className={`mt-1.5 h-2 w-2 shrink-0 ${SEV_DOT[f.severity] ?? SEV_DOT.info}`} />
                  <span className="min-w-0 break-words">{f.title}{f.page && <span className="font-mono text-xs text-dim"> · {pathOf(f.page)}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="mt-7 grid gap-8 sm:grid-cols-[1.2fr_1fr]">
        <div>
          <h3 className="eyebrow mb-3">Evidence</h3>
          <EvidenceList items={verdict.evidence} score={verdict.score} from={exhibitFrom} />
        </div>
        <NextSteps steps={verdict.next_steps} title={stepsTitle} />
      </div>
      {actions && <div className="mt-7 flex flex-wrap gap-3 border-t border-line pt-5">{actions}</div>}
    </article>
  );
}
