import type { Db } from "../db";
import { one } from "../db";
import { notify } from "../photon/notify";
import { chargeAlert } from "../photon/templates";
import type { Verdict } from "../schemas";
import type { RunInput } from "./types";

/** After a charge run: a linked, flagged charge triggers the iMessage alert (cross-link P2 → P3). */
export async function afterRun(db: Db, input: RunInput, verdict: Verdict, verdictId?: string) {
  if (input.kind !== "txn") return;
  const l = verdict.linked;
  if (!l?.exposure_id || l.kind !== "flagged" || verdict.verdict === "looks_ok") return;
  const t = await one<{ descriptor: string; amount_cents: number }>(db, "SELECT descriptor, amount_cents FROM transactions WHERE id=$1", [input.txnId]);
  const e = await one<{ host: string; created_at: Date }>(db, "SELECT host, created_at FROM exposures WHERE id=$1", [l.exposure_id]);
  if (!t || !e) return;
  const n = await notify(db, {
    userId: input.userId, eventKey: `charge:${input.txnId}`, verdictId: verdictId ?? null, meta: { txn_id: input.txnId, exposure_id: l.exposure_id },
    body: chargeAlert({ amountCents: t.amount_cents, descriptor: t.descriptor, host: e.host, exposureAt: e.created_at }),
  });
  if (n.status === "queued") void n.done;
}
