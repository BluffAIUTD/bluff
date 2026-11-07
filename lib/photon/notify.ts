import type { Db } from "../db";
import { one } from "../db";
import { getConfig } from "../config";
import { getSender, sendWithRetry, RETRY_DELAYS_MS } from "./send";

export const MAX_ALERTS_PER_HOUR = 5;

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
  | { status: "queued"; messageId: string; done: Promise<"sent" | "failed"> }
  | { status: "skipped"; reason: "paused" | "duplicate" | "rate_limited" | "no_phone" | "no_user" };

export const MOCK_PHONE = "mock-demo-phone";

/**
 * The single choke point for outbound alerts (conflict C6): at most 1 alert per event, 5 per hour per user,
 * respects STOP (alerts_paused). Returns as soon as the message row is queued; delivery continues in `done`.
 */
export async function notify(db: Db, n: NotifyInput, opts: { delays?: number[]; sleep?: (ms: number) => Promise<void> } = {}): Promise<NotifyResult> {
  const cfg = getConfig();
  const user = await one<{ phone: string | null; alerts_paused: boolean }>(db, "SELECT phone, alerts_paused FROM users WHERE id=$1", [n.userId]);
  if (!user) return { status: "skipped", reason: "no_user" };
  const kind = n.kind ?? "alert";
  if (kind === "alert" && user.alerts_paused) return { status: "skipped", reason: "paused" };
  const phone = user.phone || cfg.photon.demoUserPhone || (cfg.photonMode === "mock" ? MOCK_PHONE : "");
  if (!phone) return { status: "skipped", reason: "no_phone" };

  if (kind === "alert") {
    const recent = await one<{ n: string }>(db, "SELECT count(*) n FROM messages WHERE user_id=$1 AND kind='alert' AND direction='out' AND status <> 'failed' AND created_at > now() - interval '1 hour'", [n.userId]);
    if (Number(recent?.n ?? 0) >= MAX_ALERTS_PER_HOUR) return { status: "skipped", reason: "rate_limited" };
  }

  const ins = await db.query(
    `INSERT INTO messages (user_id, phone, direction, body, kind, event_key, verdict_id, status, meta)
     VALUES ($1,$2,'out',$3,$4,$5,$6,'queued',$7) ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`,
    [n.userId, phone, n.body, kind, kind === "reply" ? null : n.eventKey, n.verdictId ?? null, JSON.stringify(n.meta ?? {})],
  );
  if (!ins.rows[0]) return { status: "skipped", reason: "duplicate" };
  const messageId = ins.rows[0].id as string;

  const done = (async () => {
    try {
      const r = await sendWithRetry(getSender(), phone, n.body, opts.delays ?? RETRY_DELAYS_MS, opts.sleep);
      await db.query("UPDATE messages SET status='sent', provider_id=$2 WHERE id=$1", [messageId, r.providerId]);
      return "sent" as const;
    } catch (e) {
      console.error("[notify] delivery failed", (e as Error).message);
      await db.query("UPDATE messages SET status='failed' WHERE id=$1", [messageId]).catch(() => {});
      return "failed" as const;
    }
  })();
  return { status: "queued", messageId, done };
}
