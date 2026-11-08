import type { StepEvent, Verdict } from "@/lib/schemas";
import type { BasicPayload, ScanLink, ScanMerchant, PageLite } from "@/lib/scan";
import { shortDate } from "@/lib/format";

export type Phase = "idle" | "queued" | "resolving" | "crawling" | "deep" | "done" | "error";
export type DeepState = { verdict: Verdict | null; mode: string; error?: string; runId: string | null };
export type MerchantView = ScanMerchant & {
  phase: Phase; detail?: string; pagesSeen: PageLite[]; basic: BasicPayload | null; deep: DeepState | null; steps: StepEvent[];
  /** A new charge from a live push or the card watcher (shown on top with a NEW badge); the ids of the new charges. */
  isNew?: boolean; newAt?: number; newTxnIds?: string[];
};
export type { BasicPayload, PageLite, ScanLink };

export const LABEL = { likely_scam: "Likely scam", unsure: "Unsure", looks_ok: "Looks OK" } as const;
export const toneOf = (label?: string | null) => (label === "likely_scam" ? "scam" : label === "unsure" ? "unsure" : label === "looks_ok" ? "safe" : "neutral") as "scam" | "unsure" | "safe" | "neutral";
/** The verdict to lead with: the deep (AI) one when it ran live, otherwise the basic check. */
export const headline = (m: MerchantView): Verdict | null => (m.deep?.verdict && m.deep.mode === "live" ? m.deep.verdict : m.deep?.verdict && m.deep.mode === "cached" ? m.deep.verdict : m.basic?.verdict ?? null);
export const pageUrl = (origin: string | undefined, page?: string) => {
  if (!page) return null;
  if (/^https?:\/\//.test(page)) return page;
  return origin && page.startsWith("/") ? origin + page : null;
};

/** "Linked: you entered your card on fastkicks-shop.bluffai.us on Nov 5" (or the scam-text wording for reported links). */
export function linkText(l: Pick<ScanLink, "host" | "at" | "userAction" | "fieldTypes">): string {
  const date = shortDate(l.at);
  if (l.userAction === "received_link") return `Linked: the link in a scam text you reported on ${date}`;
  const card = (l.fieldTypes ?? []).some((f) => f === "card_number" || f === "cvv");
  return `Linked: you entered your ${card ? "card" : "details"} on ${l.host} on ${date}`;
}

/** "5 s ago", "3 min ago". */
export function ago(iso: string | null, now = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s} s ago` : s < 3600 ? `${Math.floor(s / 60)} min ago` : `${Math.floor(s / 3600)} h ago`;
}
