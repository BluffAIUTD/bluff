import { many, one } from "../../db";
import { normalizeDescriptor } from "../../linker/normalize";
import { str, type ToolContext, type ToolDef } from "./types";

export async function txnSearch(args: { descriptor_norm: string; days?: number }, ctx: ToolContext) {
  const norm = normalizeDescriptor(args.descriptor_norm) || args.descriptor_norm.toLowerCase();
  const days = Math.min(365, Math.max(1, Math.floor(args.days ?? 90)));
  const before = ctx.txnTs ?? ctx.now ?? new Date();
  const stats = await one<{ n: string; avg: string | null; max: number | null; last: Date | null }>(
    ctx.db,
    `SELECT count(*) n, round(avg(amount_cents)) avg, max(amount_cents) max, max(ts) last
       FROM transactions WHERE user_id=$1 AND descriptor_norm=$2 AND ts < $3 AND ts >= $3 - ($4 || ' days')::interval`,
    [ctx.userId, norm, before, String(days)],
  );
  const series = await many<{ day: Date; sum_cents: string }>(
    ctx.db,
    "SELECT day, sum_cents FROM merchant_daily WHERE user_id=$1 AND descriptor_norm=$2 AND day >= ($3::timestamptz - ($4 || ' days')::interval) ORDER BY day LIMIT 30",
    [ctx.userId, norm, before, String(days)],
  );
  return {
    count: Number(stats?.n ?? 0), avg_cents: stats?.avg ? Number(stats.avg) : 0, max_cents: stats?.max ?? 0,
    last_seen: stats?.last ? stats.last.toISOString().slice(0, 10) : null,
    series: series.map((s) => [s.day.toISOString().slice(0, 10), Number(s.sum_cents)]),
  };
}

export const txnSearchTool: ToolDef = {
  name: "txn_search",
  description: "Prior charges from a merchant (normalized descriptor) in the last N days, with count, average, max and a daily series from the continuous aggregate.",
  parameters: { type: "object", properties: { descriptor_norm: { type: "string" }, days: { type: "number" } }, required: ["descriptor_norm"] },
  run: async (args, ctx) => txnSearch({ descriptor_norm: str(args.descriptor_norm, 200), days: typeof args.days === "number" ? args.days : 90 }, ctx),
};
