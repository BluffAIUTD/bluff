import { getConfig } from "../../config";
import { many } from "../../db";
import { messageKeys } from "../../rules/signals";
import { rankCategories } from "../../rules/message";
import { TAXONOMY_BY_ID } from "../../../data/taxonomy";
import { str, type ToolContext, type ToolDef } from "./types";

type Row = { id: string; name: string; description: string; examples: string[]; red_flags: string[]; embedding: number[] | null };
export type TaxonomyMatch = { category: string; kind: "scam" | "legit"; score: number; red_flags: string[]; method: "embedding" | "keyword"; next_steps?: string[] };

/** Scam or legit, from Bluff's taxonomy (data/taxonomy.ts); unknown rows count as scam only if they list red flags. */
const kindOf = (r: Pick<Row, "id" | "red_flags">): "scam" | "legit" => TAXONOMY_BY_ID.get(r.id)?.kind ?? (r.red_flags.length ? "scam" : "legit");

/** The top match carries its category's next steps, so the model can pass them on. */
const withSteps = (m: TaxonomyMatch[]): TaxonomyMatch[] => m.map((x, i) => (i === 0 && TAXONOMY_BY_ID.has(x.category) ? { ...x, next_steps: TAXONOMY_BY_ID.get(x.category)!.nextSteps } : x));

export function cosine(a: number[], b: number[]): number {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** Keyword fallback: the rules-only categorizer (lib/rules/message.ts) restricted to the stored rows. */
export function keywordMatch(text: string, rows: Pick<Row, "id" | "red_flags">[]): TaxonomyMatch[] {
  const keys = messageKeys(text);
  const scammy = keys.some((k) => !["no_ask", "directs_to_official_channel", "otp_notice"].includes(k));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = rankCategories(text, keys).filter((c) => byId.has(c.category)).map((c) => {
    const r = byId.get(c.category)!;
    const kind = kindOf(r);
    // A message with scam signals ranks scam categories first; a clean one ranks legit categories first.
    const s = c.score * ((kind === "scam") === scammy ? 1 : 0.5);
    return { category: c.category, kind, score: Number(Math.min(0.99, s / 5).toFixed(2)), red_flags: r.red_flags, method: "keyword" as const };
  });
  if (!out.length) {
    const legit = byId.has("legit_personal") ? "legit_personal" : rows[0]?.id;
    return legit ? [{ category: legit, kind: kindOf(byId.get(legit)!), score: 0.2, red_flags: byId.get(legit)!.red_flags, method: "keyword" }] : [];
  }
  return withSteps(out.sort((a, b) => b.score - a.score).slice(0, 3));
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

/**
 * Embedding similarity over stored taxonomy vectors when every row has one (a partly embedded taxonomy would rank unfairly);
 * keyword fallback on timeout/error/missing vectors.
 */
export async function taxonomyMatch(text: string, ctx: ToolContext, fetchImpl: typeof fetch = fetch): Promise<TaxonomyMatch[]> {
  const rows = await many<Row>(ctx.db, "SELECT id, name, description, examples, red_flags, embedding FROM taxonomy");
  const embedded = rows.length > 0 && rows.every((r) => r.embedding?.length);
  const q = embedded && text.trim() ? await embed(text, fetchImpl) : null;
  if (q) {
    return withSteps(rows.filter((r) => r.embedding?.length).map((r) => ({ category: r.id, kind: kindOf(r), score: Number(cosine(q, r.embedding!).toFixed(3)), red_flags: r.red_flags, method: "embedding" as const }))
      .sort((a, b) => b.score - a.score).slice(0, 3));
  }
  return keywordMatch(text, rows);
}

export const taxonomyMatchTool: ToolDef = {
  name: "taxonomy_match",
  description: "Match a message or page text to Bluff's scam/legit taxonomy. Returns the top 3 categories (scam or legit) with their typical red flags; the top one includes its recommended next steps.",
  parameters: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  run: async (args, ctx) => taxonomyMatch(str(args.text, 2000), ctx),
};
