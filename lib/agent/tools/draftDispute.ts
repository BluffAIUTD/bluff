import { createDispute } from "../../disputes";
import { str, type ToolDef } from "./types";

export const draftDisputeTool: ToolDef = {
  name: "draft_dispute",
  description: "Draft (never send) a dispute packet for a charge that is linked to a risky exposure. Returns the dispute id. Use only after exposure_lookup confirmed a link.",
  parameters: { type: "object", properties: { txn_id: { type: "string" }, exposure_id: { type: "string" } }, required: ["txn_id"] },
  run: async (args, ctx) => {
    const { dispute } = await createDispute(ctx.db, ctx.userId, str(args.txn_id, 64));
    return { dispute_id: dispute.id, status: dispute.status, generated_by: dispute.generatedBy };
  },
};
