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
const MODE_NOTE: Record<string, string> = {
  live: "Computed just now by the agent",
  cached: "Reused from an earlier check of this host",
  replayed: "Replay of the last successful run, not live",
  basic: "Rules only. The AI check was unavailable",
};
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
    <article aria-label="Verdict" className={`panel ${tone.glow} ${tone.bg} overflow-hidden`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-6">
        <span className="label">Verdict</span>
        <ModeBadge mode={verdict.mode} />
        <span className="mono text-[11px] text-dim">{MODE_NOTE[verdict.mode] ?? ""}</span>
        {checkedEarlier && <span className="mono text-[11px] text-dim">checked earlier</span>}
        {subtitle && <span className="mono ml-auto max-w-full truncate text-xs text-gray-2">{subtitle}</span>}
      </div>
      <div className="p-4 sm:p-6">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-5">
          <ScoreDial score={verdict.score} />
          <div className="min-w-[220px] flex-1">
            <h2 className={`text-3xl font-semibold tracking-tight sm:text-4xl ${tone.text}`}>{VERDICT_TEXT[label]}</h2>
            <div className="mt-4"><ConfidencePill confidence={verdict.confidence} reason={verdict.confidence_reason} /></div>
          </div>
        </div>
        {analysis && (
          <section aria-label="AI site review" className="mt-6 rounded-control border border-line bg-bg/60 p-3 sm:p-4">
            <h3 className="label">What Nemotron found on the site</h3>
            <p className="mt-2 text-[15px] leading-relaxed">{analysis.summary}</p>
            {findings.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {findings.map((f, i) => (
                  <li key={`${f.title}-${i}`} className="flex gap-2.5">
                    <span aria-label={SEV_LABEL[f.severity] ?? "Note"} title={SEV_LABEL[f.severity] ?? "Note"} className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${SEV_DOT[f.severity] ?? SEV_DOT.info}`} />
                    <span className="min-w-0 break-words">{f.title}{f.page && <span className="mono text-xs text-dim"> · {pathOf(f.page)}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <div className="mt-6 grid gap-8 border-t border-line pt-6 sm:grid-cols-2">
          <EvidenceList items={verdict.evidence} score={verdict.score} />
          <NextSteps steps={verdict.next_steps} title={stepsTitle} />
        </div>
        {actions && <div className="mt-6 flex flex-wrap gap-3 border-t border-line pt-5">{actions}</div>}
      </div>
    </article>
  );
}
