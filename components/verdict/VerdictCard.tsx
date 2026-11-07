import type { ReactNode } from "react";
import { VERDICT_TEXT, type Verdict } from "@/lib/schemas";
import { ModeBadge } from "../ui/ModeBadge";
import { ConfidencePill } from "./ConfidencePill";
import { EvidenceList } from "./EvidenceList";
import { NextSteps } from "./NextSteps";
import { ScoreDial } from "./ScoreDial";
import { toneForLabel } from "./tone";

/**
 * The single verdict UI used by /check, the extension panel, and charge detail. Low-confidence results are shown as
 * Unsure with a "What to check yourself" list instead of red/green (product_spec §4).
 */
export function VerdictCard({ verdict, subtitle, actions, checkedEarlier }: { verdict: Verdict; subtitle?: string; actions?: ReactNode; checkedEarlier?: boolean }) {
  const lowConfidence = verdict.confidence < 0.5;
  const label = lowConfidence ? "unsure" : verdict.verdict;
  const tone = toneForLabel(label);
  const stepsTitle = lowConfidence || label === "unsure" ? "What to check yourself" : label === "likely_scam" ? "Do this instead" : "Good practice";
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
      <div className="mt-5 grid gap-6 sm:grid-cols-2">
        <EvidenceList items={verdict.evidence} score={verdict.score} />
        <NextSteps steps={verdict.next_steps} title={stepsTitle} />
      </div>
      {actions && <div className="mt-6 flex flex-wrap gap-3">{actions}</div>}
    </article>
  );
}
