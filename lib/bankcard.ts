import { STORES } from "../data/stores";
import type { Db } from "./db";
import { many, one } from "./db";
import { money } from "./format";
import type { Verdict } from "./schemas";
import { latestSiteScan } from "./scan/store";
import { ownStoreSlug } from "./scan/stores";

const fmtDay = (d: Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(d);

/**
 * Today's bonus card "From your Capital One scan": one merchant from the user's own bank scan becomes a Call the Bluff
 * card that belongs to that user only (game_cards.user_id) and never enters the shared daily set.
 * The answer is the store's ground-truth label for Bluff's demo storefronts, and a confident verdict otherwise
 * (unsure verdicts are never used as answers). Returns the card id, or null when the user has no usable scan.
 */
export async function ensureBankCard(db: Db, userId: string, day: string): Promise<string | null> {
  const existing = await one<{ id: string }>(db, "SELECT id FROM game_cards WHERE day=$1 AND source='bank' AND user_id=$2 ORDER BY id LIMIT 1", [day, userId]);
  if (existing) return existing.id;
  const rows = await many<{ subject_id: string; payload: Verdict }>(db,
    `SELECT DISTINCT ON (subject_id) subject_id, payload FROM verdicts
      WHERE user_id=$1 AND subject_type='site' AND created_at > now() - interval '3 days'
        AND EXISTS (SELECT 1 FROM transactions t WHERE t.user_id=$1 AND t.website=verdicts.subject_id)
      ORDER BY subject_id, created_at DESC`, [userId]);
  const usable = rows.filter((r) => r.payload.verdict !== "unsure" && r.payload.confidence >= 0.6);
  const scam = usable.filter((r) => r.payload.verdict === "likely_scam").sort((a, b) => a.payload.score - b.payload.score || a.subject_id.localeCompare(b.subject_id))[0];
  const pick = scam ?? usable.filter((r) => r.payload.verdict === "looks_ok").sort((a, b) => b.payload.score - a.payload.score || a.subject_id.localeCompare(b.subject_id))[0];
  if (!pick) return null;
  const host = pick.subject_id;
  const t = await one<{ descriptor: string; amount_cents: number; ts: Date }>(db,
    "SELECT descriptor, amount_cents, ts FROM transactions WHERE user_id=$1 AND website=$2 ORDER BY ts DESC LIMIT 1", [userId, host]);
  if (!t) return null;

  const slug = ownStoreSlug(host.split("/")[0]);
  const isScam = slug ? !!STORES.find((s) => s.slug === slug)?.scam : pick.payload.verdict === "likely_scam";
  const scan = await latestSiteScan(db, userId, host);
  const title = scan?.crawl.pages[0]?.title?.slice(0, 70) || null;
  // Demo stores are shown by name only (never as a ".com" that could be someone's real domain).
  const shown = slug ?? host.split("/")[0];
  const body = `${money(t.amount_cents)} charge at ${t.descriptor} on ${fmtDay(t.ts)}. You paid on ${shown}${title ? ` — the page says "${title}"` : ""}.`;
  const ev = pick.payload.analysis?.findings.filter((f) => f.severity === "high" || f.severity === "medium").map((f) => f.title) ?? pick.payload.evidence;
  const redFlags = isScam
    ? [{ span: shown, why: ev[0] ?? "The site behind this charge looks like a scam" }, ...(title ? [{ span: title, why: ev[1] ?? "The page itself shows scam signals" }] : [])].map((f) => ({ span: f.span, why: f.why.slice(0, 100) }))
    : [];
  const ins = await one<{ id: string }>(db,
    "INSERT INTO game_cards (day, kind, content, is_scam, red_flags, category, source, origin, user_id) VALUES ($1,'bank_alert',$2,$3,$4,$5,'bank',$6,$7) RETURNING id",
    [day, JSON.stringify({ from: "Capital One · your bank scan", subject: "Is this charge from a real store?", body }), isScam, JSON.stringify(redFlags), pick.payload.category, `Your Capital One scan · ${host}`, userId],
  );
  return ins?.id ?? null;
}
