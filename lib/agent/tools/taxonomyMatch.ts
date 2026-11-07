import { getConfig } from "../../config";
import { many } from "../../db";
import { messageKeys } from "../../rules/signals";
import { str, type ToolContext, type ToolDef } from "./types";

type Row = { id: string; name: string; description: string; examples: string[]; red_flags: string[]; embedding: number[] | null };
export type TaxonomyMatch = { category: string; score: number; red_flags: string[]; method: "embedding" | "keyword" };

const KEY_CATEGORY: Record<string, string> = {
  small_fee_request: "delivery_fee", credential_request: "bank_impersonation", gift_card_request: "gift_card_request",
  too_good_returns: "investment", phone_callback: "tech_support", threat_language: "toll_scam", gift_card_only: "fake_store",
  too_good_discount: "fake_store", countdown_timer: "fake_store", urgency_language: "account_suspension", lookalike_domain: "bank_impersonation",
};
const TERMS: [RegExp, string][] = [
  [/parcel|package|deliver|courier/, "delivery_fee"], [/\btoll/, "toll_scam"], [/bank|card ending|\bpin\b/, "bank_impersonation"],
  [/\bwon\b|prize|giveaway|winner/, "prize_giveaway"], [/suspend|account will|password/, "account_suspension"],
  [/antivirus|virus|renewal/, "tech_support"], [/crypto|invest|returns/, "investment"], [/gift\s?card/, "gift_card_request"], [/% off|sale/, "fake_store"],
];

export function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export function keywordMatch(text: string, rows: Pick<Row, "id" | "red_flags">[]): TaxonomyMatch[] {
  const t = text.toLowerCase();
  const score = new Map<string, number>();
  for (const k of messageKeys(text)) { const c = KEY_CATEGORY[k]; if (c) score.set(c, (score.get(c) ?? 0) + 0.3); }
  for (const [re, c] of TERMS) if (re.test(t)) score.set(c, (score.get(c) ?? 0) + 0.25);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = [...score.entries()].filter(([id]) => byId.has(id)).map(([id, s]) => ({ category: id, score: Number(Math.min(0.99, s).toFixed(2)), red_flags: byId.get(id)!.red_flags, method: "keyword" as const }));
  if (!out.length) {
    const legit = byId.has("legit_transactional") ? "legit_transactional" : rows[0]?.id;
    return legit ? [{ category: legit, score: 0.3, red_flags: [], method: "keyword" }] : [];
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
}

async function embed(text: string, fetchImpl: typeof fetch): Promise<number[] | null> {
  const c = getConfig();
  if (!c.nvidia.apiKey || !c.nvidia.embedModel) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 2000);
  try {
    const res = await fetchImpl(`${c.nvidia.baseUrl}/embeddings`, {
      method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${c.nvidia.apiKey}` },
      body: JSON.stringify({ model: c.nvidia.embedModel, input: [text], input_type: "query", encoding_format: "float" }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { embedding?: number[] }[] };
    return j.data?.[0]?.embedding ?? null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** Embedding similarity over stored taxonomy vectors when available; keyword fallback on timeout/error/no vectors. */
export async function taxonomyMatch(text: string, ctx: ToolContext, fetchImpl: typeof fetch = fetch): Promise<TaxonomyMatch[]> {
  const rows = await many<Row>(ctx.db, "SELECT id, name, description, examples, red_flags, embedding FROM taxonomy");
  const q = text.trim() ? await embed(text, fetchImpl) : null;
  if (q && rows.some((r) => r.embedding?.length)) {
    return rows.filter((r) => r.embedding?.length).map((r) => ({ category: r.id, score: Number(cosine(q, r.embedding!).toFixed(3)), red_flags: r.red_flags, method: "embedding" as const }))
      .sort((a, b) => b.score - a.score).slice(0, 3);
  }
  return keywordMatch(text, rows);
}

export const taxonomyMatchTool: ToolDef = {
  name: "taxonomy_match",
  description: "Match a message or page text to the scam taxonomy. Returns the top 3 categories with their typical red flags.",
  parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  run: async (args, ctx) => taxonomyMatch(str(args.text, 2000), ctx),
};
