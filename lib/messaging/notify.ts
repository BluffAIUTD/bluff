import type { Db } from "../db";
import { one } from "../db";

/**
 * Bluff's alerts and replies are delivered in-app: they land in the user's inbox, which the T-Mobile phone preview shows.
 * No SMS or iMessage provider is involved.
 */
export const MAX_ALERTS_PER_HOUR = 5;
/** Value of messages.phone for in-app delivery (the column predates in-app messaging). */
export const PHONE_PREVIEW = "phone-preview";

export type NotifyInput = {
  userId: string;
  /** unique per event: at most one alert per event */
  eventKey: string;
  body: string;
  kind?: "alert" | "reply";
  verdictId?: string | null;
  meta?: Record<string, unknown>;
};

export type NotifyResult =
  | { status: "delivered"; messageId: string }
  | { status: "skipped"; reason: "paused" | "duplicate" | "rate_limited" | "no_user" };

/** The single choke point for outbound alerts: at most 1 alert per event, 5 per hour per user, respects STOP (alerts_paused). */
export async function notify(db: Db, n: NotifyInput): Promise<NotifyResult> {
  const user = await one<{ alerts_paused: boolean }>(db, "SELECT alerts_paused FROM users WHERE id=$1", [n.userId]);
  if (!user) return { status: "skipped", reason: "no_user" };
  const kind = n.kind ?? "alert";
  if (kind === "alert" && user.alerts_paused) return { status: "skipped", reason: "paused" };
  if (kind === "alert") {
    const recent = await one<{ n: string }>(db, "SELECT count(*) n FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND created_at > now() - interval '1 hour'", [n.userId]);
    if (Number(recent?.n ?? 0) >= MAX_ALERTS_PER_HOUR) return { status: "skipped", reason: "rate_limited" };
  }
  const ins = await db.query(
    `INSERT INTO messages (user_id, phone, direction, body, kind, event_key, verdict_id, status, meta)
     VALUES ($1,$2,'out',$3,$4,$5,$6,'delivered',$7) ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`,
    [n.userId, PHONE_PREVIEW, n.body, kind, kind === "reply" ? null : n.eventKey, n.verdictId ?? null, JSON.stringify(n.meta ?? {})],
  );
  if (!ins.rows[0]) return { status: "skipped", reason: "duplicate" };
  return { status: "delivered", messageId: ins.rows[0].id as string };
}
