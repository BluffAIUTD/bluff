import type { Db } from "../db";
import { one } from "../db";
import { notify } from "../messaging/notify";
import { chargeAlert } from "../messaging/templates";
import type { Verdict } from "../schemas";
import type { RunInput } from "./types";

/** Send the "linked charge" alert to the phone preview for a charge/exposure pair. Safe to call repeatedly (one alert per charge). */
export async function sendChargeAlert(db: Db, userId: string, txnId: string, exposureId: string, verdictId?: string | null) {
  const t = await one<{ descriptor: string; amount_cents: number }>(db, "SELECT descriptor, amount_cents FROM transactions WHERE id=$1 AND user_id=$2", [txnId, userId]);
  const e = await one<{ host: string; created_at: Date; user_action: string }>(db, "SELECT host, created_at, user_action FROM exposures WHERE id=$1 AND user_id=$2", [exposureId, userId]);
  if (!t || !e) return null;
  const n = await notify(db, {
    userId, eventKey: `charge:${txnId}`, verdictId: verdictId ?? null,
    meta: { source: "charge", txn_id: txnId, exposure_id: exposureId, host: e.host, actions: ["DISPUTE", "HOLD", "SAFE"] },
    body: chargeAlert({ amountCents: t.amount_cents, descriptor: t.descriptor, host: e.host, exposureAt: e.created_at, via: e.user_action === "received_link" ? "text" : "entered" }),
  });
  return n;
}

/**
 * After a charge run: a linked, flagged charge triggers an alert in the phone preview. Bank-scan site runs alert through
 * lib/safesignal.ts (called by the scan, which knows when a whole scan or a single new charge is done).
 */
export async function afterRun(db: Db, input: RunInput, verdict: Verdict, verdictId?: string) {
  if (input.kind !== "txn") return;
  const l = verdict.linked;
  if (!l?.exposure_id || l.kind !== "flagged" || verdict.verdict === "looks_ok") return;
  await sendChargeAlert(db, input.userId, input.txnId, l.exposure_id, verdictId);
}
