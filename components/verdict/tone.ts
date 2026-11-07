import { verdictLabel, type VerdictLabel } from "@/lib/schemas";

export type ScoreTone = { label: VerdictLabel; text: string; stroke: string; bg: string; border: string };

const TONES: Record<VerdictLabel, ScoreTone> = {
  likely_scam: { label: "likely_scam", text: "text-scam", stroke: "var(--scam)", bg: "bg-scam/10", border: "border-scam/40" },
  unsure: { label: "unsure", text: "text-unsure", stroke: "var(--unsure)", bg: "bg-unsure/10", border: "border-unsure/40" },
  looks_ok: { label: "looks_ok", text: "text-safe", stroke: "var(--safe)", bg: "bg-safe/10", border: "border-safe/40" },
};

export const toneFor = (score: number): ScoreTone => TONES[verdictLabel(score)];
export const toneForLabel = (l: VerdictLabel): ScoreTone => TONES[l];
