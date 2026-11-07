import { z } from "zod";
import { ApiError, handle } from "@/lib/errors";
import { getContext, json, parseBody } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { getExposure, toExposureDto, type ExposureRow } from "@/lib/exposures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Patch = z.object({ watch: z.boolean().optional() });

export const PATCH = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = getContext(req);
  const { id } = await params;
  const body = await parseBody(req, Patch);
  const existing = await getExposure(getPool(), ctx.userId, id);
  if (!existing) throw new ApiError("not_found", "Exposure not found");
  const row = (await getPool().query<ExposureRow>("UPDATE exposures SET watch = COALESCE($3, watch) WHERE id=$1 AND user_id=$2 RETURNING *", [id, ctx.userId, body.watch ?? null])).rows[0];
  return json(ctx, { exposure: toExposureDto(row) });
});

export const DELETE = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = getContext(req);
  const { id } = await params;
  const existing = await getExposure(getPool(), ctx.userId, id);
  if (!existing) throw new ApiError("not_found", "Exposure not found");
  await getPool().query("DELETE FROM exposures WHERE id=$1 AND user_id=$2", [id, ctx.userId]);
  return new Response(null, { status: 204 });
});
