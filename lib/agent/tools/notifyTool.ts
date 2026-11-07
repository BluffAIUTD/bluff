import { sendChargeAlert } from "../hooks";
import { str, type ToolDef } from "./types";

/** The model can only request the canned charge alert for a (charge, exposure) pair; it cannot write message text. */
export const notifyTool: ToolDef = {
  name: "notify",
  description: "Queue the standard iMessage alert for a charge linked to a risky exposure. Respects the per-event and 5-per-hour limits and paused alerts.",
  parameters: { type: "object", properties: { kind: { type: "string", enum: ["charge_alert"] }, txn_id: { type: "string" }, exposure_id: { type: "string" } }, required: ["kind", "txn_id", "exposure_id"] },
  run: async (args, ctx) => {
    if (args.kind !== "charge_alert") return { queued: false, reason: "unsupported kind" };
    const n = await sendChargeAlert(ctx.db, ctx.userId, str(args.txn_id, 64), str(args.exposure_id, 64));
    if (!n) return { queued: false, reason: "unknown charge or exposure" };
    return n.status === "queued" ? { queued: true } : { queued: false, reason: n.reason };
  },
};
