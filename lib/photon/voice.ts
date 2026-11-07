import type { Db } from "../db";
import { one } from "../db";
import { getConfig } from "../config";
import { MOCK_PHONE } from "./notify";

export const CALL_MIN_CENTS = 4000;
export const CALL_MAX_SCORE = 30;

export type Caller = { call(phone: string, spoken: string): Promise<{ providerId: string }> };

export const mockCaller: Caller = {
  async call() {
    if (process.env.PHOTON_MOCK_FAIL === "1") throw new Error("mock call failure");
    return { providerId: `mockcall_${Date.now().toString(36)}` };
  },
};

/**
 * Live Photon voice call. [verify] The calling setup (it may require a SIP partner) and the REST shape are unconfirmed
 * until Photon's docs are read; this is isolated so only this object changes.
 */
export const liveCaller: Caller = {
  async call(phone, spoken) {
    const c = getConfig().photon;
    if (!c.apiBase || !c.projectSecret) throw new Error("Photon is not configured");
    const res = await fetch(`${c.apiBase.replace(/\/$/, "")}/calls`, {
      method: "POST", signal: AbortSignal.timeout(10_000),
      headers: { "content-type": "application/json", authorization: `Bearer ${c.projectSecret}` },
      body: JSON.stringify({ to: phone, from: c.number || undefined, say: spoken }),
    });
    if (!res.ok) throw new Error(`Photon call failed: ${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { providerId: j.id ?? `photon_call_${Date.now()}` };
  },
};

/** ≤ 25 words, read aloud. The descriptor is spelled out letter by letter so it is understandable. */
export function spokenSummary(a: { amountCents: number; descriptor: string }): string {
  const letters = a.descriptor.replace(/[^A-Za-z]/g, "").slice(0, 6).split("").join(" ");
  const dollars = Math.floor(a.amountCents / 100);
  const s = `Bluff alert. A ${dollars} dollar charge from ${letters} matches a risky site you used. Check your texts to dispute it.`;
  return s;
}

export function shouldCall(amountCents: number, score: number) { return amountCents >= CALL_MIN_CENTS && score < CALL_MAX_SCORE; }

/** Place the call; on failure nothing else is needed because the text alert is sent separately. Returns the outcome. */
export async function callForCharge(db: Db, a: { userId: string; txnId: string; exposureId: string; amountCents: number; descriptor: string; caller?: Caller }): Promise<"placed" | "failed" | "skipped"> {
  const cfg = getConfig();
  const user = await one<{ phone: string | null; alerts_paused: boolean }>(db, "SELECT phone, alerts_paused FROM users WHERE id=$1", [a.userId]);
  if (!user || user.alerts_paused) return "skipped";
  const phone = user.phone || cfg.photon.demoUserPhone || (cfg.photonMode === "mock" ? MOCK_PHONE : "");
  if (!phone) return "skipped";
  const spoken = spokenSummary(a);
  const ins = await db.query(
    `INSERT INTO messages (user_id, phone, direction, body, kind, event_key, status, meta) VALUES ($1,$2,'out',$3,'call',$4,'queued',$5)
     ON CONFLICT (event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`,
    [a.userId, phone, spoken, `call:${a.txnId}`, JSON.stringify({ txn_id: a.txnId, exposure_id: a.exposureId })],
  );
  if (!ins.rows[0]) return "skipped";
  try {
    const r = await (a.caller ?? (cfg.photonMode === "live" ? liveCaller : mockCaller)).call(phone, spoken);
    await db.query("UPDATE messages SET status='sent', provider_id=$2 WHERE id=$1", [ins.rows[0].id, r.providerId]);
    return "placed";
  } catch (e) {
    console.error("[voice] call failed; the text alert still stands:", (e as Error).message);
    await db.query("UPDATE messages SET status='failed' WHERE id=$1", [ins.rows[0].id]);
    return "failed";
  }
}
