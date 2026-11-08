import type { ReactNode } from "react";

export type Tone = "scam" | "unsure" | "safe" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  scam: "bg-scam/10 text-scam border-scam/50",
  unsure: "bg-unsure/10 text-unsure border-unsure/50",
  safe: "bg-safe/10 text-safe border-safe/50",
  accent: "bg-accent/10 text-accent border-accent/40",
  neutral: "bg-transparent text-dim border-gray-3",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-[2px] font-mono text-[11px] font-medium uppercase tracking-[.06em] ${TONES[tone]}`}>
      {children}
    </span>
  );
}
