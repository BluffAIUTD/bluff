import type { Db } from "../db";
import { one } from "../db";
import { notify } from "../photon/notify";
import { chargeAlert } from "../photon/templates";
import type { Verdict } from "../schemas";
import type { RunInput } from "./types";

/** Queue the "linked charge" iMessage for a charge/exposure pair. Safe to call repeatedly (one alert per charge). */
export async function sendChargeAlert(db: Db, userId: string, txnId: string, exposureId: string, verdictId?: string | null) {
  const t = await one<{ descriptor: string; amount_cents: number }>(db, "SELECT descriptor, amount_cents FROM transactions WHERE id=$1 AND user_id=$2", [txnId, userId]);
  const e = await one<{ host: string; created_at: Date }>(db, "SELECT host, created_at FROM exposures WHERE id=$1 AND user_id=$2", [exposureId, userId]);
  if (!t || !e) return null;
  const n = await notify(db, {
    userId, eventKey: `charge:${txnId}`, verdictId: verdictId ?? null, meta: { txn_id: txnId, exposure_id: exposureId },
    body: chargeAlert({ amountCents: t.amount_cents, descriptor: t.descriptor, host: e.host, exposureAt: e.created_at }),
  });
  if (n.status === "queued") void n.done;
  return n;
}

/** After a charge run: a linked, flagged charge triggers the iMessage alert (cross-link P2 → P3). */
export async function afterRun(db: Db, input: RunInput, verdict: Verdict, verdictId?: string) {
  if (input.kind !== "txn") return;
  const l = verdict.linked;
  if (!l?.exposure_id || l.kind !== "flagged" || verdict.verdict === "looks_ok") return;
  await sendChargeAlert(db, input.userId, input.txnId, l.exposure_id, verdictId);
}
