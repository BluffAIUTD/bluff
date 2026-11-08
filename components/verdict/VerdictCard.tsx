"use client";
import type { ReactNode } from "react";
import { VERDICT_TEXT, type Verdict } from "@/lib/schemas";
import { ModeBadge } from "../ui/ModeBadge";
import { CardBackFace, FlipCard, useRevealed } from "../table/FlipCard";
import { CornerIndex } from "../table/PlayingCardFace";
import { Suit, SUIT_INK } from "../table/Suit";
import { ConfidencePill } from "./ConfidencePill";
import { EvidenceList } from "./EvidenceList";
import { NextSteps } from "./NextSteps";
import { ScoreDial } from "./ScoreDial";
import { toneForLabel } from "./tone";

const SEV_DOT: Record<string, string> = { high: "bg-scam", medium: "bg-unsure", low: "bg-gray-4", good: "bg-safe", info: "bg-accent" };
const SEV_LABEL: Record<string, string> = { high: "High risk", medium: "Medium", low: "Low", good: "Good sign", info: "Note" };
const pathOf = (p: string) => { try { return new URL(p).pathname; } catch { return p; } };

/**
 * The single verdict UI used by /check, the extension panel, and charge detail. The verdict is a playing card that
 * turns over when the result arrives; the score is a chip stack. Low-confidence results are shown as Unsure with a
 * "What to check yourself" list instead of red/green (product_spec §4).
 */
export function VerdictCard({ verdict, subtitle, actions, checkedEarlier, flip = true }: { verdict: Verdict; subtitle?: string; actions?: ReactNode; checkedEarlier?: boolean; flip?: boolean }) {
  const lowConfidence = verdict.confidence < 0.5;
  const label = lowConfidence ? "unsure" : verdict.verdict;
  const tone = toneForLabel(label);
  const revealed = useRevealed(flip);
  const stepsTitle = lowConfidence || label === "unsure" ? "What to check yourself" : label === "likely_scam" ? "Do this instead" : "Good practice";
  // Nemotron's own read of the crawled site (page checks and bank-scan reviews); never shown on rules-only fallbacks.
  const analysis = verdict.mode === "live" || verdict.mode === "cached" ? verdict.analysis : undefined;
  const findings = (analysis?.findings ?? []).filter((f) => f.severity !== "info").slice(0, 6);
  const score = Math.max(0, Math.min(100, Math.round(verdict.score)));

  const face = (
    <div className="card-face relative flex aspect-[5/7] w-full flex-col items-center justify-center gap-3 rounded-[14px] px-4 text-center">
      <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[9px] border" style={{ borderColor: "rgba(120,90,30,0.28)" }} />
      <CornerIndex rank={score} suit={tone.suit} />
      <CornerIndex rank={score} suit={tone.suit} flip />
      <Suit kind={tone.suit} className="h-20 w-20 drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" />
      <h2 className="serif text-[28px] font-bold leading-none tracking-tight" style={{ color: SUIT_INK[tone.suit] }}>{VERDICT_TEXT[label]}</h2>
      {subtitle && <p className="max-w-full truncate text-[11px] font-bold uppercase tracking-[0.14em] text-[#5a4a2a]">{subtitle}</p>}
    </div>
  );

  return (
    <article aria-label="Verdict" className="stitch rounded-card border brass-hairline bg-surface p-4 sm:p-6" style={{ boxShadow: `inset 0 3px 0 rgb(${tone.rgb}), inset 0 0 40px rgba(0,0,0,.3)` } as never}>
      <div className="relative z-10 grid gap-6 md:grid-cols-[minmax(190px,224px)_1fr] md:gap-8">
        <FlipCard flipped={revealed} className="mx-auto w-full max-w-[224px]" front={<CardBackFace className="aspect-[5/7] w-full" />} back={face} />
        <div className="flex min-w-0 flex-col justify-center gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <ModeBadge mode={verdict.mode} />
            {checkedEarlier && <span className="text-xs text-dim">checked earlier</span>}
          </div>
          <ScoreDial score={verdict.score} />
          <ConfidencePill confidence={verdict.confidence} reason={verdict.confidence_reason} />
        </div>
      </div>
      {analysis && (
        <section aria-label="AI site review" className="relative z-10 mt-6 rounded-control border brass-hairline bg-black/25 p-3 sm:p-4">
          <h3 className="font-grotesk uppercase text-dim">What Nemotron found on the site</h3>
          <p className="mt-2 text-[15px] leading-relaxed">{analysis.summary}</p>
          {findings.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {findings.map((f, i) => (
                <li key={`${f.title}-${i}`} className="flex gap-2">
                  <span aria-label={SEV_LABEL[f.severity] ?? "Note"} title={SEV_LABEL[f.severity] ?? "Note"} className={`mt-1.5 h-2 w-2 shrink-0 rotate-45 rounded-[1px] ${SEV_DOT[f.severity] ?? SEV_DOT.info}`} />
                  <span className="min-w-0 break-words">{f.title}{f.page && <span className="font-mono text-xs text-dim"> · {pathOf(f.page)}</span>}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="relative z-10 mt-6 grid gap-6 sm:grid-cols-2">
        <EvidenceList items={verdict.evidence} score={verdict.score} />
        <NextSteps steps={verdict.next_steps} title={stepsTitle} />
      </div>
      {actions && <div className="relative z-10 mt-6 flex flex-wrap gap-3 border-t border-dashed brass-hairline pt-5">{actions}</div>}
    </article>
  );
}
