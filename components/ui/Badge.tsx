import type { ReactNode } from "react";

export type Tone = "scam" | "unsure" | "safe" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  scam: "bg-scam/15 text-[#ff9b90] border-scam/50",
  unsure: "bg-unsure/15 text-[#f5c46b] border-unsure/50",
  safe: "bg-safe/15 text-[#8fe3b8] border-safe/45",
  accent: "bg-accent/15 text-[#f1d894] border-accent/50",
  neutral: "bg-white/5 text-dim border-line",
};

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-[2px] text-xs font-semibold ${TONES[tone]}`}>
      {children}
    </span>
  );
}
