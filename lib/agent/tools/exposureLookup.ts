import { many } from "../../db";
import { findCandidates } from "../../linker";
import { labelFromHost } from "../../linker/normalize";
import { getConfig } from "../../config";
import { str, type ToolContext, type ToolDef } from "./types";

export async function exposureLookup(args: { descriptor?: string; host?: string }, ctx: ToolContext) {
  const ts = ctx.txnTs ?? ctx.now ?? new Date();
  if (args.descriptor) {
    const r = await findCandidates(ctx.db, ctx.userId, { ts, descriptor: args.descriptor });
    return r.candidates.map((c) => ({ exposure_id: c.exposureId, host: c.host, date: c.exposureAt.slice(0, 10), score: c.exposureScore, match_score: c.matchScore, reasons: c.reasons, kind: c.kind }));
  }
  if (args.host) {
    const label = labelFromHost(args.host, ctx.baseDomain ?? getConfig().baseDomain);
    const rows = await many<{ id: string; host: string; created_at: Date; score: number }>(
      ctx.db, "SELECT id, host, created_at, score FROM exposures WHERE user_id=$1 AND label=$2 ORDER BY created_at DESC LIMIT 3", [ctx.userId, label],
    );
    return rows.map((r) => ({ exposure_id: r.id, host: r.host, date: r.created_at.toISOString().slice(0, 10), score: r.score, match_score: 1, reasons: ["same site"], kind: r.score >= 70 ? "expected" : "flagged" }));
  }
  return [];
}

export const exposureLookupTool: ToolDef = {
  name: "exposure_lookup",
  description: "Search the user's Exposure Log for sites that could explain a charge descriptor (or for a host). Returns up to 3 candidates with match scores and reasons. Only report links that appear here; never invent one.",
  parameters: { type: "object", properties: { descriptor: { type: "string" }, host: { type: "string" } } },
  run: async (args, ctx) => exposureLookup({ descriptor: str(args.descriptor, 200) || undefined, host: str(args.host, 255) || undefined }, ctx),
};
