import type { ReactNode } from "react";

export type Tone = "scam" | "unsure" | "safe" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  scam: "bg-scam/15 text-scam border-scam/40",
  unsure: "bg-unsure/15 text-unsure border-unsure/40",
  safe: "bg-safe/15 text-safe border-safe/40",
  accent: "bg-accent/20 text-[#b9b9ff] border-accent/50",
  neutral: "bg-surface2 text-dim border-line",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  );
}
