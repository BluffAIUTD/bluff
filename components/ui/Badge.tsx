import type { ReactNode } from "react";

export type Tone = "scam" | "unsure" | "safe" | "accent" | "neutral";

const TONES: Record<Tone, string> = {
  scam: "bg-scam/10 text-scam border-scam/35",
  unsure: "bg-unsure/10 text-unsure border-unsure/35",
  safe: "bg-safe/10 text-safe border-safe/35",
  accent: "bg-accent/10 text-accent border-accent/35",
  neutral: "bg-surface2 text-dim border-line2",
};

/** Small mono chip. */
export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-[6px] border px-1.5 py-[3px] font-mono text-[11px] font-medium leading-none tracking-wide ${TONES[tone]}`}>
      {children}
    </span>
  );
}
