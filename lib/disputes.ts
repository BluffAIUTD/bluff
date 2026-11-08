import type { Db } from "./db";
import { many, one } from "./db";
import { getConfig, liveAgentAvailable } from "./config";
import { ApiError } from "./errors";
import { findCandidates, type LinkCandidate } from "./linker";
import { chat } from "./agent/llm";
import { domainIntel } from "./agent/tools/domainIntel";
import { chicagoDate, listFields } from "./messaging/templates";

export type TimelineItem = { kind: "exposure" | "alert" | "charge"; at: string; label: string; detail: string };
export type DisputeDto = { id: string; txnId: string; exposureId: string | null; letter: string; timeline: TimelineItem[]; nextSteps: string[]; status: "draft" | "filed"; generatedBy: "ai" | "template"; createdAt: string };

export const NEXT_STEPS = [
  "Call the number on the back of your card",
  "Ask for a dispute of this charge",
  "Lock or replace the card",
  "Watch for repeat charges",
  "Change passwords you reuse",
];

const REASON: Record<string, string> = {
  fake_store: "Suspected fraudulent online store", delivery_fee: "Suspected delivery-fee scam", toll_scam: "Suspected toll scam",
  card_testing: "Suspected card testing", price_drift: "Unexpected price change", unclear: "Unrecognized charge",
};

const longDate = (d: Date | string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(new Date(d));
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export type DisputeFacts = {
  name: string; descriptor: string; amountCents: number; chargedAt: Date; category: string;
  host: string; exposedAt: Date; fieldTypes: string[]; siteScore: number; siteAgeDays: number | null; matchReasons: string[];
  alertAt?: Date | null; now?: Date;
};

/** Narrative built only from facts we hold. */
export function templateNarrative(f: DisputeFacts): string {
  const age = f.siteAgeDays != null ? `, a website registered ${f.siteAgeDays} day${f.siteAgeDays === 1 ? "" : "s"} earlier that Bluff rated ${f.siteScore}/100,` : `, a website that Bluff rated ${f.siteScore}/100,`;
  return `On ${longDate(f.exposedAt)} I entered my ${listFields(f.fieldTypes)} on ${f.host}${age} before a charge of ${money(f.amountCents)} from "${f.descriptor}" appeared on ${longDate(f.chargedAt)}. The merchant name matches that website (${f.matchReasons[0] ?? "name and timing match"}). I did not intend to make a recurring purchase from this merchant.`;
}

export function buildLetter(f: DisputeFacts, narrative: string): string {
  return [
    "To: Card issuer — Disputes Department",
    `Date: ${longDate(f.now ?? new Date(Math.max(Date.now(), f.chargedAt.getTime())))}`,
    "Re: Dispute of a suspected fraudulent charge",
    "",
    `Cardholder: ${f.name}`,
    "Card: ending in [last 4 digits of your card]",
    `Charge date: ${longDate(f.chargedAt)}`,
    `Amount: ${money(f.amountCents)}`,
    `Merchant (as on statement): ${f.descriptor}`,
    `Reason: ${REASON[f.category] ?? REASON.unclear}`,
    "",
    "I am disputing the charge above.",
    narrative,
    "",
    "[Edit before sending: say whether you received any goods or services, and whether you contacted the merchant.]",
    "",
    "Supporting evidence (timeline) is attached. Please investigate and credit the amount while the dispute is open.",
    "",
    "Sincerely,",
    f.name,
  ].join("\n");
}

export function buildTimeline(f: DisputeFacts): TimelineItem[] {
  const items: TimelineItem[] = [
    { kind: "exposure", at: f.exposedAt.toISOString(), label: `Entered ${listFields(f.fieldTypes)} on ${f.host}`, detail: `Bluff trust score ${f.siteScore}/100${f.siteAgeDays != null ? `, site ${f.siteAgeDays} days old` : ""}` },
  ];
  if (f.alertAt) items.push({ kind: "alert", at: f.alertAt.toISOString(), label: "Bluff sent you an alert", detail: "Text alert about this site" });
  items.push({ kind: "charge", at: f.chargedAt.toISOString(), label: `${money(f.amountCents)} charged by ${f.descriptor}`, detail: f.matchReasons.join("; ") });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Optional AI prose (8 s budget). Returns null on any failure so the caller uses the template narrative. */
export async function aiNarrative(f: DisputeFacts, fetchImpl?: typeof fetch): Promise<string | null> {
  const c = getConfig();
  if (!liveAgentAvailable(c)) return null;
  try {
    const r = await chat({
      model: c.nvidia.smallModel || c.nvidia.model, fetchImpl, signal: AbortSignal.timeout(8000), maxTokens: 300,
      messages: [
        { role: "system", content: "Write 2-3 first-person sentences for a card dispute letter. Use ONLY the facts provided. Do not claim the user did or did not receive goods. No legal advice. Plain text." },
        { role: "user", content: JSON.stringify({ merchant: f.descriptor, amount: money(f.amountCents), charged_on: longDate(f.chargedAt), website: f.host, entered: listFields(f.fieldTypes), entered_on: longDate(f.exposedAt), site_score: f.siteScore, site_age_days: f.siteAgeDays, match: f.matchReasons }) },
      ],
    });
    const text = (r.content ?? "").trim();
    return text.length >= 40 && text.length <= 700 ? text : null;
  } catch { return null; }
}

type Row = { id: string; txn_id: string; exposure_id: string | null; letter: string; timeline: TimelineItem[]; next_steps: string[]; status: "draft" | "filed"; generated_by: "ai" | "template"; created_at: Date };
export const toDisputeDto = (r: Row): DisputeDto => ({ id: r.id, txnId: r.txn_id, exposureId: r.exposure_id, letter: r.letter, timeline: r.timeline, nextSteps: r.next_steps, status: r.status, generatedBy: r.generated_by, createdAt: r.created_at.toISOString() });

export async function getDisputeForTxn(db: Db, userId: string, txnId: string) {
  const r = await one<Row>(db, "SELECT * FROM disputes WHERE user_id=$1 AND txn_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, txnId]);
  return r ? toDisputeDto(r) : null;
}

/**
 * Draft a dispute packet for a charge that links to a risky exposure. Never sends anything. AI prose with a template fallback,
 * so the Refund Builder always works. Idempotent: returns the existing packet for the charge unless `regenerate`.
 */
export async function createDispute(db: Db, userId: string, txnId: string, opts: { regenerate?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ dispute: DisputeDto; created: boolean }> {
  if (!opts.regenerate) { const ex = await getDisputeForTxn(db, userId, txnId); if (ex) return { dispute: ex, created: false }; }
  const t = await one<{ ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number }>(db, "SELECT ts, descriptor, descriptor_norm, amount_cents FROM transactions WHERE id=$1 AND user_id=$2", [txnId, userId]);
  if (!t) throw new ApiError("not_found", "Charge not found");
  const link = await findCandidates(db, userId, { ts: t.ts, descriptor: t.descriptor, descriptorNorm: t.descriptor_norm });
  const best: LinkCandidate | null = link.best;
  if (!best || best.kind !== "flagged") throw new ApiError("conflict", "This charge isn't linked to a risky site, so there is nothing to dispute yet.");

  const user = await one<{ name: string }>(db, "SELECT name FROM users WHERE id=$1", [userId]);
  const intel = await domainIntel(best.host, { userId, db }).catch(() => null);
  const alert = await one<{ created_at: Date }>(db, "SELECT created_at FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND status <> 'failed' AND meta->>'exposure_id'=$2 ORDER BY created_at LIMIT 1", [userId, best.exposureId]);
  const verdict = await one<{ payload: { category?: string } }>(db, "SELECT payload FROM verdicts WHERE user_id=$1 AND subject_type='txn' AND subject_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, txnId]);
  const facts: DisputeFacts = {
    name: user?.name ?? "Cardholder", descriptor: t.descriptor, amountCents: t.amount_cents, chargedAt: t.ts, category: verdict?.payload.category ?? "fake_store",
    host: best.host, exposedAt: new Date(best.exposureAt), fieldTypes: best.fieldTypes, siteScore: best.exposureScore, siteAgeDays: intel?.age_days ?? null, matchReasons: best.reasons,
    alertAt: alert?.created_at ?? null,
  };
  const ai = await aiNarrative(facts, opts.fetchImpl);
  const letter = buildLetter(facts, ai ?? templateNarrative(facts));
  const row = (await db.query<Row>(
    `INSERT INTO disputes (user_id, txn_id, exposure_id, letter, timeline, next_steps, status, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING *`,
    [userId, txnId, best.exposureId, letter, JSON.stringify(buildTimeline(facts)), JSON.stringify(NEXT_STEPS), ai ? "ai" : "template"],
  )).rows[0];
  return { dispute: toDisputeDto(row), created: true };
}

export async function markFiled(db: Db, userId: string, id: string): Promise<DisputeDto> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("not_found", "Dispute not found");
  const r = (await db.query<Row>("UPDATE disputes SET status='filed' WHERE id=$1 AND user_id=$2 RETURNING *", [id, userId])).rows[0];
  if (!r) throw new ApiError("not_found", "Dispute not found");
  return toDisputeDto(r);
}

export async function listDisputes(db: Db, userId: string) { return (await many<Row>(db, "SELECT * FROM disputes WHERE user_id=$1 ORDER BY created_at DESC", [userId])).map(toDisputeDto); }
export { chicagoDate };
