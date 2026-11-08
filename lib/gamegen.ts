import type { Db } from "./db";
import { many } from "./db";
import { getConfig, liveAgentAvailable } from "./config";
import { chat } from "./agent/llm";

const KINDS = new Set(["text", "checkout", "email", "receipt", "bank_alert"]);
/** Real brand names are never allowed in cards (fictional ones only). A card containing one is dropped. */
const REAL_BRANDS = /\b(amazon|paypal|apple|google|microsoft|netflix|walmart|target|usps|ups|fedex|dhl|chase|wells fargo|bank of america|citibank|t-mobile|verizon|at&t|venmo|zelle|cash app|facebook|instagram|whatsapp|irs|ebay|nike|adidas)\b/i;

export type GenCard = {
  kind: string; content: { from?: string; subject?: string; body: string }; is_scam: boolean; category: string; red_flags: { span: string; why: string }[];
};

export function validateCard(c: unknown): GenCard | null {
  if (!c || typeof c !== "object") return null;
  const o = c as Record<string, unknown>;
  const content = o.content as GenCard["content"] | undefined;
  if (typeof o.kind !== "string" || !KINDS.has(o.kind) || !content || typeof content.body !== "string" || typeof o.is_scam !== "boolean" || typeof o.category !== "string") return null;
  const text = [content.from, content.subject, content.body].filter((x) => typeof x === "string").join("\n");
  if (content.body.length === 0 || content.body.length > 300) return null;
  if (REAL_BRANDS.test(text)) return null;
  const flags = Array.isArray(o.red_flags) ? (o.red_flags as { span?: unknown; why?: unknown }[]).filter((f) => typeof f?.span === "string" && typeof f?.why === "string") as { span: string; why: string }[] : [];
  // Spans must be in the body: that is the text players tap to show what gave it away.
  const verbatim = flags.filter((f) => f.span.length > 0 && content.body.includes(f.span));
  if (o.is_scam && verbatim.length < 1) return null; // scam cards need ≥ 1 red flag that appears verbatim
  return { kind: o.kind, content: { ...(content.from ? { from: String(content.from) } : {}), ...(content.subject ? { subject: String(content.subject) } : {}), body: content.body }, is_scam: o.is_scam, category: o.category.slice(0, 64), red_flags: o.is_scam ? verbatim : [] };
}

export function extractJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = t.indexOf("{"), end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(t.slice(start, end + 1)); } catch { return null; }
}

/** Most common scam category among the last 7 days of likely_scam verdicts (excluding unclear/basic fallbacks), else null. */
export async function lookalikeCategory(db: Db, now = new Date()): Promise<string | null> {
  const rows = await many<{ category: string; n: string }>(
    db,
    `SELECT payload->>'category' AS category, count(*) n FROM verdicts
      WHERE payload->>'verdict'='likely_scam' AND created_at > $1 AND payload->>'category' NOT IN ('unclear','legit_store','known_merchant')
      GROUP BY 1 ORDER BY n DESC, category LIMIT 1`,
    [new Date(now.getTime() - 7 * 86_400_000)],
  );
  return rows[0]?.category ?? null;
}

export type GenResult = { inserted: number; dropped: number; lookalike: string | null; reason?: string };

/**
 * Generate up to 5 cards for `day` with the small model: 2 scam + 2 legit-style categories from the taxonomy plus one
 * lookalike of this week's most-flagged pattern. Anything invalid is dropped; with nothing valid the seeded pool is used.
 */
export async function generateCards(db: Db, day: string, opts: { fetchImpl?: typeof fetch; now?: Date } = {}): Promise<GenResult> {
  const c = getConfig();
  if (!liveAgentAvailable(c)) return { inserted: 0, dropped: 0, lookalike: null, reason: "model not configured; using the seeded pool" };
  const existing = await many(db, "SELECT 1 FROM game_cards WHERE day=$1 AND source <> 'seed' LIMIT 1", [day]);
  if (existing.length) return { inserted: 0, dropped: 0, lookalike: null, reason: "already generated" };

  const tax = await many<{ id: string; name: string; description: string; red_flags: string[] }>(db, "SELECT id, name, description, red_flags FROM taxonomy ORDER BY id");
  const withFlags = tax.filter((t) => t.red_flags.length);
  const off = withFlags.length ? Math.floor(Date.parse(day) / 86_400_000) % withFlags.length : 0;
  const scamCats = [...withFlags.slice(off), ...withFlags.slice(0, off)].slice(0, 2); // rotates daily
  const legitCats = tax.filter((t) => !t.red_flags.length).slice(0, 2);
  const look = await lookalikeCategory(db, opts.now);
  const lookCat = tax.find((t) => t.id === look && t.red_flags.length) ?? null;

  const spec = [...scamCats.map((t) => ({ category: t.id, is_scam: true, about: t.description, typical_flags: t.red_flags })), ...legitCats.map((t) => ({ category: t.id, is_scam: false, about: t.description })),
    ...(lookCat ? [{ category: lookCat.id, is_scam: true, about: `a fresh variation of: ${lookCat.description}`, typical_flags: lookCat.red_flags, lookalike: true }] : [])];
  let raw: string | null = null;
  try {
    const r = await chat({
      model: c.nvidia.smallModel || c.nvidia.model, fetchImpl: opts.fetchImpl, signal: AbortSignal.timeout(20_000), maxTokens: 1400, temperature: 0.8,
      messages: [
        { role: "system", content: 'You write training cards for a scam-spotting game. Reply with JSON only: {"cards":[{"kind":"text|checkout|email|receipt|bank_alert","content":{"from":"optional","subject":"optional","body":"max 300 chars"},"is_scam":true|false,"category":"<category id>","red_flags":[{"span":"exact substring of content.body","why":"one short line"}]}]}. Use ONLY fictional company names. Scam cards need 1-3 red_flags whose span appears verbatim in content.body. Legit cards have red_flags []. No real brands, phone numbers or links to real sites.' },
        { role: "user", content: JSON.stringify({ cards_wanted: spec }) },
      ],
    });
    raw = r.content;
  } catch (e) { return { inserted: 0, dropped: 0, lookalike: lookCat?.id ?? null, reason: `model failed: ${(e as Error).message}` }; }

  const parsed = extractJson(raw ?? "") as { cards?: unknown[] } | null;
  if (!parsed || !Array.isArray(parsed.cards)) return { inserted: 0, dropped: 0, lookalike: lookCat?.id ?? null, reason: "model returned unreadable output" };
  let inserted = 0, dropped = 0, looked = false;
  for (const card of parsed.cards.slice(0, 6)) {
    const v = validateCard(card);
    if (!v) { dropped++; continue; }
    const isLook: boolean = !looked && !!lookCat && v.category === lookCat.id && v.is_scam;
    looked ||= isLook;
    // The lookalike takes a hard slot in the day's ladder; other generated cards are medium.
    await db.query("INSERT INTO game_cards (day, kind, content, is_scam, red_flags, category, source, difficulty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [day, v.kind, JSON.stringify(v.content), v.is_scam, JSON.stringify(v.red_flags), v.category, isLook ? "lookalike" : "generated", isLook ? "hard" : "medium"]);
    inserted++;
  }
  return { inserted, dropped, lookalike: lookCat?.id ?? null };
}
