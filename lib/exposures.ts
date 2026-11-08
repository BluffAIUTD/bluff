import { createHmac } from "node:crypto";
import type { Db } from "./db";
import { many, one } from "./db";
import { getConfig } from "./config";
import type { ExposureAction, ExposureDto } from "./types";
import type { FieldType, VerdictLabel } from "./schemas";
import { linkedCounts } from "./linker/counts";
import { labelFromHost } from "./linker/normalize";

export type ExposureRow = {
  id: string; url: string; host: string; label: string; field_types: string[]; score: number; verdict: string; verdict_id: string | null;
  watch: boolean; user_action: ExposureAction; created_at: Date; source?: string; sender_hash?: string | null;
};

export const toExposureDto = (r: ExposureRow, linkedCount?: number): ExposureDto => ({
  id: r.id, url: r.url, host: r.host, label: r.label, fieldTypes: r.field_types as FieldType[], score: r.score, verdict: r.verdict,
  verdictId: r.verdict_id, watch: r.watch, userAction: r.user_action, createdAt: r.created_at.toISOString(), ...(linkedCount !== undefined ? { linkedCount } : {}),
  ...(r.source ? { source: r.source } : {}),
});

export async function listExposures(db: Db, userId: string): Promise<ExposureDto[]> {
  const rows = await many<ExposureRow>(db, "SELECT * FROM exposures WHERE user_id=$1 ORDER BY created_at DESC", [userId]);
  if (!rows.length) return [];
  const txns = await many<{ ts: Date; descriptor: string; descriptor_norm: string }>(db, "SELECT ts, descriptor, descriptor_norm FROM transactions WHERE user_id=$1 AND ts >= $2", [userId, rows[rows.length - 1].created_at]);
  const counts = linkedCounts(rows, txns);
  return rows.map((r) => toExposureDto(r, counts.get(r.id) ?? 0));
}

export async function getExposure(db: Db, userId: string, id: string): Promise<ExposureRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return one<ExposureRow>(db, "SELECT * FROM exposures WHERE id=$1 AND user_id=$2", [id, userId]);
}

// ---- link memory from reported texts (Safe Signal) -----------------------------------------------------------------------

/** Salted one-way hash of a phone number or short code: lets Bluff tell senders apart without ever storing the number. */
export function senderHash(sender: string | null | undefined): string | null {
  const digits = (sender ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
  if (!digits) return null;
  return createHmac("sha256", `${getConfig().sessionSecret}:sender`).update(digits).digest("hex").slice(0, 32);
}

/** Host of the first usable link in a text ("https://x.example/pay" or "x.top/pay"), lower-cased, without "www.", or null. */
export function linkHost(urls: string[]): string | null {
  for (const u of urls) {
    try {
      const h = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).host.toLowerCase().replace(/^www\./, "");
      if (h && h.length <= 253 && /\.[a-z]{2,}(:\d+)?$/i.test(h)) return h;
    } catch { /* next */ }
  }
  return null;
}

/** A reported text with this host within this window reuses its exposure instead of logging the same link twice. */
const RECEIVED_LINK_DEDUPE_HOURS = 24;

/**
 * Record the link in a scam text the user reported as an exposure (user_action 'received_link', source 'sms'), so a later
 * charge from that site links back to the text. Stores only the host, its label, the verdict and score, and at most a
 * salted hash of the sender. Never the message body, never the link's path or query (they can identify the recipient).
 */
export async function recordReceivedLink(db: Db, userId: string, a: { host: string; score: number; verdict: VerdictLabel; verdictId: string | null; sender?: string | null }): Promise<{ exposure: ExposureRow; created: boolean }> {
  const host = a.host.toLowerCase();
  const existing = await one<ExposureRow>(db,
    `SELECT * FROM exposures WHERE user_id=$1 AND host=$2 AND user_action='received_link' AND created_at > now() - ($3 || ' hours')::interval ORDER BY created_at DESC LIMIT 1`,
    [userId, host, String(RECEIVED_LINK_DEDUPE_HOURS)]);
  if (existing) return { exposure: existing, created: false };
  const row = (await db.query<ExposureRow>(
    `INSERT INTO exposures (user_id, url, host, label, field_types, score, verdict, verdict_id, watch, user_action, source, sender_hash)
     VALUES ($1,$2,$3,$4,'{}',$5,$6,$7,true,'received_link','sms',$8) RETURNING *`,
    [userId, `https://${host}`, host, labelFromHost(host, getConfig().baseDomain), a.score, a.verdict, a.verdictId, senderHash(a.sender)],
  )).rows[0];
  return { exposure: row, created: true };
}
