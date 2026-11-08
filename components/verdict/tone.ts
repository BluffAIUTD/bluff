import { verdictLabel, type VerdictLabel } from "@/lib/schemas";
import type { ChipTone } from "../table/chips";
import type { SuitKind } from "../table/Suit";

export type ScoreTone = { label: VerdictLabel; text: string; stroke: string; bg: string; border: string; chip: ChipTone; suit: SuitKind; rgb: string };

const TONES: Record<VerdictLabel, ScoreTone> = {
  likely_scam: { label: "likely_scam", text: "text-scam", stroke: "var(--scam)", bg: "bg-scam/10", border: "border-scam/40", chip: "scam", suit: "scam", rgb: "224 87 76" },
  unsure: { label: "unsure", text: "text-unsure", stroke: "var(--unsure)", bg: "bg-unsure/10", border: "border-unsure/40", chip: "unsure", suit: "unsure", rgb: "232 168 58" },
  looks_ok: { label: "looks_ok", text: "text-safe", stroke: "var(--safe)", bg: "bg-safe/10", border: "border-safe/40", chip: "safe", suit: "safe", rgb: "95 207 151" },
};

export const toneFor = (score: number): ScoreTone => TONES[verdictLabel(score)];
export const toneForLabel = (l: VerdictLabel): ScoreTone => TONES[l];
