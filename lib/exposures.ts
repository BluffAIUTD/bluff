import type { Db } from "./db";
import { many, one } from "./db";
import type { ExposureDto } from "./types";
import type { FieldType } from "./schemas";
import { linkedCounts } from "./linker/counts";

export type ExposureRow = {
  id: string; url: string; host: string; label: string; field_types: string[]; score: number; verdict: string; verdict_id: string | null;
  watch: boolean; user_action: "continue" | "watch"; created_at: Date;
};

export const toExposureDto = (r: ExposureRow, linkedCount?: number): ExposureDto => ({
  id: r.id, url: r.url, host: r.host, label: r.label, fieldTypes: r.field_types as FieldType[], score: r.score, verdict: r.verdict,
  verdictId: r.verdict_id, watch: r.watch, userAction: r.user_action, createdAt: r.created_at.toISOString(), ...(linkedCount !== undefined ? { linkedCount } : {}),
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
