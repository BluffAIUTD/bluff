import type { Db } from "./db";
import { many, one } from "./db";
import { getConfig, liveAgentAvailable } from "./config";
import { ApiError } from "./errors";
import { findCandidates, type LinkCandidate } from "./linker";
import { chat } from "./agent/llm";
import { domainIntel } from "./agent/tools/domainIntel";
import { chicagoDate, listFields } from "./messaging/templates";
import { VERDICT_TEXT, type Verdict, type VerdictLabel } from "./schemas";

export type TimelineItem = {
  kind: "exposure" | "text" | "site_check" | "alert" | "charge"; at: string; label: string; detail: string;
  /** Public page URLs the item cites (site check findings). */
  sources?: string[];
};
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
  subscription_trap: "Suspected subscription trap", identity_theft: "Suspected fraudulent merchant",
};

const longDate = (d: Date | string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "America/Chicago" }).format(new Date(d));
const money = (c: number) => `$${(c / 100).toFixed(2)}`;

// ---- site checks (bank scan) ------------------------------------------------------------------------------------------

/** Unsure sites scoring below this count as risky for Safe Signal (phone alerts, the risky_site flag, dispute basis). */
export const RISKY_UNSURE_MAX = 50;
export const isRiskySite = (v: { label: string; score: number }) => v.label === "likely_scam" || (v.label === "unsure" && v.score < RISKY_UNSURE_MAX);

/** The latest check of a merchant website: the deep (Nemotron) site verdict when present, else the crawl's basic check. */
export type SiteCheck = {
  host: string; score: number; label: VerdictLabel; confidence: number;
  /** "live" | "cached" | "replayed" | "basic", as stored with the verdict. */
  mode: string; category: string; checkedAt: string; verdictId: string | null;
  /** Top warning signs, each with the crawled page it came from when known (absolute http(s) URL). */
  findings: { title: string; detail?: string; page?: string }[];
  /** The user replied SAFE (allowlisted this host). */
  allowlisted: boolean;
};

type SiteVerdictRow = { host: string; id: string; payload: Verdict; mode: string; created_at: Date };
type BasicFinding = { title: string; detail?: string; severity: string; page?: string };
type SiteScanRow = { host: string; basic: { score: number; label: VerdictLabel; confidence: number; category: string; findings: BasicFinding[] }; origin: string | null; created_at: Date };

const WARN = new Set(["high", "medium", "low"]);

/** A crawled page reference as an absolute http(s) URL, else undefined. */
function pageUrl(origin: string | null, page?: string): string | undefined {
  if (!page) return undefined;
  if (/^https?:\/\//i.test(page)) return page;
  return origin && /^https?:\/\//i.test(origin) && page.startsWith("/") ? origin.replace(/\/+$/, "") + page : undefined;
}

function toSiteCheck(host: string, v: SiteVerdictRow | undefined, s: SiteScanRow | undefined, allowlisted: boolean): SiteCheck | null {
  const origin = s?.origin ?? null;
  const basicFindings = (s?.basic.findings ?? []).filter((f) => WARN.has(f.severity)).map((f) => ({ title: f.title, detail: f.detail || undefined, page: pageUrl(origin, f.page) }));
  // Same rule as the scan page: the deep verdict leads unless a newer crawl replaced it.
  const deep = v && (!s || v.created_at.getTime() >= s.created_at.getTime() - 60_000) ? v : null;
  if (deep) {
    const p = deep.payload;
    const ai = (p.analysis?.findings ?? []).filter((f) => WARN.has(f.severity)).map((f) => ({ title: f.title, detail: f.detail || undefined, page: pageUrl(origin, f.page) }));
    const findings = ai.length ? ai : p.evidence.map((e) => ({ title: e, page: basicFindings.find((b) => b.title === e)?.page }));
    return { host, score: p.score, label: p.verdict, confidence: p.confidence, mode: deep.mode, category: p.category, checkedAt: deep.created_at.toISOString(), verdictId: deep.id, findings: findings.slice(0, 5), allowlisted };
  }
  if (!s) return null;
  return { host, score: s.basic.score, label: s.basic.label, confidence: s.basic.confidence, mode: "basic", category: s.basic.category, checkedAt: s.created_at.toISOString(), verdictId: null, findings: basicFindings.slice(0, 5), allowlisted };
}

/** Latest site check per website for this user (transactions.website = verdicts.subject_id = site_scans.host). */
export async function latestSiteChecks(db: Db, userId: string, hosts: (string | null | undefined)[]): Promise<Map<string, SiteCheck>> {
  const out = new Map<string, SiteCheck>();
  const list = [...new Set(hosts.filter((h): h is string => !!h))];
  if (!list.length) return out;
  const [verdicts, scans, allow] = await Promise.all([
    many<SiteVerdictRow>(db, `SELECT DISTINCT ON (subject_id) subject_id AS host, id, payload, mode, created_at FROM verdicts
      WHERE user_id=$1 AND subject_type='site' AND subject_id = ANY($2::text[]) ORDER BY subject_id, created_at DESC`, [userId, list]),
    many<SiteScanRow>(db, `SELECT DISTINCT ON (host) host, basic, crawl->>'origin' AS origin, created_at FROM site_scans
      WHERE user_id=$1 AND host = ANY($2::text[]) ORDER BY host, created_at DESC`, [userId, list]),
    many<{ host: string }>(db, "SELECT host FROM allowlist WHERE user_id=$1 AND host = ANY($2::text[])", [userId, list]),
  ]);
  const v = new Map(verdicts.map((r) => [r.host, r]));
  const s = new Map(scans.map((r) => [r.host, r]));
  const a = new Set(allow.map((r) => r.host));
  for (const h of list) { const c = toSiteCheck(h, v.get(h), s.get(h), a.has(h)); if (c) out.set(h, c); }
  return out;
}

export async function siteCheckFor(db: Db, userId: string, host: string | null | undefined): Promise<SiteCheck | null> {
  if (!host) return null;
  return (await latestSiteChecks(db, userId, [host])).get(host) ?? null;
}

// ---- dispute facts -----------------------------------------------------------------------------------------------------

export type DisputeFacts = {
  name: string; descriptor: string; amountCents: number; chargedAt: Date; category: string;
  host: string; exposedAt: Date; fieldTypes: string[]; siteScore: number; siteAgeDays: number | null; matchReasons: string[];
  alertAt?: Date | null; now?: Date;
  /** How the exposure happened: the user entered info on the site (default), or reported a scam text linking to it. */
  exposureKind?: "entered" | "received_link";
  /** The bank scan's check of the charge's merchant website, when it is risky. */
  siteCheck?: SiteCheck | null;
};

/** A charge disputed on the strength of the bank scan's site check alone (no exposure link). */
export type SiteDisputeFacts = {
  basis: "site"; name: string; descriptor: string; amountCents: number; chargedAt: Date; category: string;
  siteCheck: SiteCheck; alertAt?: Date | null; now?: Date;
};
export type AnyDisputeFacts = DisputeFacts | SiteDisputeFacts;
const isSiteBasis = (f: AnyDisputeFacts): f is SiteDisputeFacts => "basis" in f && f.basis === "site";

const MODE_TEXT: Record<string, string> = {
  live: "Nemotron deep review", cached: "Nemotron deep review (reused from earlier today)", replayed: "Replayed review (not live)", basic: "Basic check (rules only, no AI)",
};
const pct = (c: number) => `${Math.round(c * 100)}%`;
const warningSigns = (s: SiteCheck, n = 3) => s.findings.slice(0, n).map((x) => x.title.replace(/[.!]+$/, "")).join("; ");

/** Narrative built only from facts we hold. */
export function templateNarrative(f: AnyDisputeFacts): string {
  if (isSiteBasis(f)) {
    const s = f.siteCheck;
    const signs = warningSigns(s);
    return `A charge of ${money(f.amountCents)} from "${f.descriptor}" posted to my card on ${longDate(f.chargedAt)}. On ${longDate(s.checkedAt)} Bluff, a scam-checking service, reviewed the merchant's website (${s.host}) and rated it ${s.score}/100 (${VERDICT_TEXT[s.label].toLowerCase()})${signs ? `, citing: ${signs}` : ""}. Based on these warning signs I am asking you to investigate this charge.`;
  }
  const age = f.siteAgeDays != null ? `, a website registered ${f.siteAgeDays} day${f.siteAgeDays === 1 ? "" : "s"} earlier that Bluff rated ${f.siteScore}/100,` : `, a website that Bluff rated ${f.siteScore}/100,`;
  const match = f.matchReasons[0] ?? "name and timing match";
  if (f.exposureKind === "received_link") {
    return `On ${longDate(f.exposedAt)} I received a text message with a link to ${f.host}${age} and reported it to Bluff as a likely scam. A charge of ${money(f.amountCents)} from "${f.descriptor}" appeared on ${longDate(f.chargedAt)}. The merchant name matches that website (${match}). I did not intend to make a purchase from this merchant.`;
  }
  return `On ${longDate(f.exposedAt)} I entered my ${listFields(f.fieldTypes)} on ${f.host}${age} before a charge of ${money(f.amountCents)} from "${f.descriptor}" appeared on ${longDate(f.chargedAt)}. The merchant name matches that website (${match}). I did not intend to make a recurring purchase from this merchant.`;
}

export function buildLetter(f: AnyDisputeFacts, narrative: string): string {
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

/** The site check as a timeline entry: score, label, mode and confidence as given, top findings and their pages. */
export function siteCheckItem(s: SiteCheck): TimelineItem {
  const sources = [...new Set(s.findings.map((x) => x.page).filter((p): p is string => !!p))].slice(0, 3);
  const signs = warningSigns(s);
  return {
    kind: "site_check", at: s.checkedAt, label: `Bluff checked ${s.host}: ${s.score}/100, ${VERDICT_TEXT[s.label].toLowerCase()}`,
    detail: `${MODE_TEXT[s.mode] ?? s.mode}, ${pct(s.confidence)} sure.${signs ? ` ${signs}.` : ""}`, ...(sources.length ? { sources } : {}),
  };
}

export function buildTimeline(f: AnyDisputeFacts): TimelineItem[] {
  const items: TimelineItem[] = [];
  if (isSiteBasis(f)) items.push(siteCheckItem(f.siteCheck));
  else {
    const age = f.siteAgeDays != null ? `, site ${f.siteAgeDays} days old` : "";
    items.push(f.exposureKind === "received_link"
      ? { kind: "text", at: f.exposedAt.toISOString(), label: `Reported a scam text linking to ${f.host}`, detail: `Bluff rated the link ${f.siteScore}/100${age}. The text itself was discarded.` }
      : { kind: "exposure", at: f.exposedAt.toISOString(), label: `Entered ${listFields(f.fieldTypes)} on ${f.host}`, detail: `Bluff trust score ${f.siteScore}/100${age}` });
    if (f.siteCheck) items.push(siteCheckItem(f.siteCheck));
  }
  if (f.alertAt) items.push({ kind: "alert", at: f.alertAt.toISOString(), label: "Bluff sent you an alert", detail: isSiteBasis(f) ? "Text alert about this charge" : "Text alert about this site" });
  items.push({ kind: "charge", at: f.chargedAt.toISOString(), label: `${money(f.amountCents)} charged by ${f.descriptor}`, detail: isSiteBasis(f) ? `Merchant website: ${f.siteCheck.host}` : f.matchReasons.join("; ") });
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** The only facts the model may use, by basis. */
function narrativeFacts(f: AnyDisputeFacts) {
  if (isSiteBasis(f)) {
    const s = f.siteCheck;
    return { merchant: f.descriptor, amount: money(f.amountCents), charged_on: longDate(f.chargedAt), merchant_website: s.host, website_checked_on: longDate(s.checkedAt), site_score: s.score, site_verdict: VERDICT_TEXT[s.label], warning_signs: s.findings.slice(0, 3).map((x) => x.title) };
  }
  const base = { merchant: f.descriptor, amount: money(f.amountCents), charged_on: longDate(f.chargedAt), website: f.host, site_score: f.siteScore, site_age_days: f.siteAgeDays, match: f.matchReasons };
  return f.exposureKind === "received_link"
    ? { ...base, how_the_site_came_up: "link in a text message the cardholder received and reported as a scam", text_reported_on: longDate(f.exposedAt) }
    : { ...base, entered: listFields(f.fieldTypes), entered_on: longDate(f.exposedAt) };
}

/** Optional AI prose (8 s budget). Returns null on any failure so the caller uses the template narrative. */
export async function aiNarrative(f: AnyDisputeFacts, fetchImpl?: typeof fetch): Promise<string | null> {
  const c = getConfig();
  if (!liveAgentAvailable(c)) return null;
  try {
    const r = await chat({
      model: c.nvidia.smallModel || c.nvidia.model, fetchImpl, signal: AbortSignal.timeout(8000), maxTokens: 300,
      messages: [
        { role: "system", content: "Write 2-3 first-person sentences for a card dispute letter. Use ONLY the facts provided. Do not claim the user did or did not receive goods. No legal advice. Plain text." },
        { role: "user", content: JSON.stringify(narrativeFacts(f)) },
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

type TxnRow = { ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number; website: string | null };
const TXN_SQL = "SELECT ts, descriptor, descriptor_norm, amount_cents, website FROM transactions WHERE id=$1 AND user_id=$2";

/** Why a charge can be disputed: a link to a risky exposure (entered info, or a reported scam text), else a risky site check. */
export type DisputeBasis =
  | { kind: "exposure"; link: LinkCandidate; exposureKind: "entered" | "received_link"; site: SiteCheck | null }
  | { kind: "site"; site: SiteCheck };

async function basisFor(db: Db, userId: string, t: TxnRow, site: SiteCheck | null): Promise<DisputeBasis | null> {
  const link = await findCandidates(db, userId, { ts: t.ts, descriptor: t.descriptor, descriptorNorm: t.descriptor_norm });
  const riskySite = site && !site.allowlisted && isRiskySite(site) ? site : null;
  if (link.best?.kind === "flagged") {
    const e = await one<{ user_action: string }>(db, "SELECT user_action FROM exposures WHERE id=$1 AND user_id=$2", [link.best.exposureId, userId]);
    return { kind: "exposure", link: link.best, exposureKind: e?.user_action === "received_link" ? "received_link" : "entered", site: riskySite };
  }
  return riskySite ? { kind: "site", site: riskySite } : null;
}

export type DisputeBasisKind = "exposure" | "received_link" | "site";

/**
 * What the charge page needs to agree with createDispute: the basis createDispute would use (null = nothing to dispute)
 * and the latest site check of the charge's merchant website (shown even when it looks OK).
 */
export async function disputeContext(db: Db, userId: string, txnId: string): Promise<{ basis: DisputeBasisKind | null; site: SiteCheck | null } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(txnId)) return null;
  const t = await one<TxnRow>(db, TXN_SQL, [txnId, userId]);
  if (!t) return null;
  const site = await siteCheckFor(db, userId, t.website);
  const b = await basisFor(db, userId, t, site);
  return { basis: !b ? null : b.kind === "site" ? "site" : b.exposureKind === "received_link" ? "received_link" : "exposure", site };
}

/**
 * Draft a dispute packet for a charge that links to a risky exposure (a site where the user entered info, or the link in a
 * scam text they reported), or whose merchant website the bank scan rated risky. Never sends anything. AI prose with a
 * template fallback, so the Refund Builder always works. Idempotent: returns the existing packet unless `regenerate`.
 */
export async function createDispute(db: Db, userId: string, txnId: string, opts: { regenerate?: boolean; fetchImpl?: typeof fetch } = {}): Promise<{ dispute: DisputeDto; created: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(txnId)) throw new ApiError("not_found", "Charge not found");
  if (!opts.regenerate) { const ex = await getDisputeForTxn(db, userId, txnId); if (ex) return { dispute: ex, created: false }; }
  const t = await one<TxnRow>(db, TXN_SQL, [txnId, userId]);
  if (!t) throw new ApiError("not_found", "Charge not found");
  const basis = await basisFor(db, userId, t, await siteCheckFor(db, userId, t.website));
  if (!basis) throw new ApiError("conflict", "This charge isn't linked to a risky site, so there is nothing to dispute yet.");

  const user = await one<{ name: string }>(db, "SELECT name FROM users WHERE id=$1", [userId]);
  const verdict = await one<{ payload: { category?: string } }>(db, "SELECT payload FROM verdicts WHERE user_id=$1 AND subject_type='txn' AND subject_id=$2 ORDER BY created_at DESC LIMIT 1", [userId, txnId]);
  let facts: AnyDisputeFacts;
  let exposureId: string | null = null;
  if (basis.kind === "exposure") {
    const best = basis.link;
    exposureId = best.exposureId;
    const intel = await domainIntel(best.host, { userId, db }).catch(() => null);
    const alert = await one<{ created_at: Date }>(db, "SELECT created_at FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND status <> 'failed' AND meta->>'exposure_id'=$2 ORDER BY created_at LIMIT 1", [userId, best.exposureId]);
    facts = {
      name: user?.name ?? "Cardholder", descriptor: t.descriptor, amountCents: t.amount_cents, chargedAt: t.ts, category: verdict?.payload.category ?? "fake_store",
      host: best.host, exposedAt: new Date(best.exposureAt), fieldTypes: best.fieldTypes, siteScore: best.exposureScore, siteAgeDays: intel?.age_days ?? null, matchReasons: best.reasons,
      alertAt: alert?.created_at ?? null, exposureKind: basis.exposureKind, siteCheck: basis.site,
    };
  } else {
    const alert = await one<{ created_at: Date }>(db, "SELECT created_at FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND status <> 'failed' AND (meta->>'txn_id'=$2 OR meta->'txn_ids' ? $2) ORDER BY created_at LIMIT 1", [userId, txnId]);
    facts = {
      basis: "site", name: user?.name ?? "Cardholder", descriptor: t.descriptor, amountCents: t.amount_cents, chargedAt: t.ts,
      category: REASON[basis.site.category] ? basis.site.category : verdict?.payload.category ?? "fake_store", siteCheck: basis.site, alertAt: alert?.created_at ?? null,
    };
  }
  const ai = await aiNarrative(facts, opts.fetchImpl);
  const letter = buildLetter(facts, ai ?? templateNarrative(facts));
  const row = (await db.query<Row>(
    `INSERT INTO disputes (user_id, txn_id, exposure_id, letter, timeline, next_steps, status, generated_by)
     VALUES ($1,$2,$3,$4,$5,$6,'draft',$7) RETURNING *`,
    [userId, txnId, exposureId, letter, JSON.stringify(buildTimeline(facts)), JSON.stringify(NEXT_STEPS), ai ? "ai" : "template"],
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
