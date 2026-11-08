import type { StepEvent, Verdict } from "@/lib/schemas";
import type { BasicPayload, ScanMerchant, PageLite } from "@/lib/scan";

export type Phase = "idle" | "queued" | "resolving" | "crawling" | "deep" | "done" | "error";
export type DeepState = { verdict: Verdict | null; mode: string; error?: string; runId: string | null };
export type MerchantView = ScanMerchant & {
  phase: Phase; detail?: string; pagesSeen: PageLite[]; basic: BasicPayload | null; deep: DeepState | null; steps: StepEvent[];
};
export type { BasicPayload, PageLite };

export const LABEL = { likely_scam: "Likely scam", unsure: "Unsure", looks_ok: "Looks OK" } as const;
export const toneOf = (label?: string | null) => (label === "likely_scam" ? "scam" : label === "unsure" ? "unsure" : label === "looks_ok" ? "safe" : "neutral") as "scam" | "unsure" | "safe" | "neutral";
/** The verdict to lead with: the deep (AI) one when it ran live, otherwise the basic check. */
export const headline = (m: MerchantView): Verdict | null => (m.deep?.verdict && m.deep.mode === "live" ? m.deep.verdict : m.deep?.verdict && m.deep.mode === "cached" ? m.deep.verdict : m.basic?.verdict ?? null);
export const pageUrl = (origin: string | undefined, page?: string) => {
  if (!page) return null;
  if (/^https?:\/\//.test(page)) return page;
  return origin && page.startsWith("/") ? origin + page : null;
};
