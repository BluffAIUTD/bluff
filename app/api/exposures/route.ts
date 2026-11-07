import { ExposureCreateSchema, verdictLabel, type Verdict } from "@/lib/schemas";
import { ApiError, handle } from "@/lib/errors";
import { getContext, json, parseBody } from "@/lib/api/helpers";
import { getPool, one } from "@/lib/db";
import { getConfig } from "@/lib/config";
import { labelFromHost } from "@/lib/linker/normalize";
import { listExposures, toExposureDto, type ExposureRow } from "@/lib/exposures";
import { notify } from "@/lib/photon/notify";
import { exposureAlert } from "@/lib/photon/templates";
import { domainIntel } from "@/lib/agent/tools/domainIntel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = handle(async (req: Request) => {
  const ctx = getContext(req);
  return json(ctx, { exposures: await listExposures(getPool(), ctx.userId) });
});

/** Logs the exposure moment. Always creates a new row (even for a host checked earlier); alerts when score < 40. */
export const POST = handle(async (req: Request) => {
  const ctx = getContext(req);
  const body = await parseBody(req, ExposureCreateSchema);
  const db = getPool();
  const v = await one<{ id: string; payload: Verdict }>(db, "SELECT id, payload FROM verdicts WHERE id::text=$1 AND user_id=$2 AND subject_type='page'", [body.verdictId, ctx.userId]);
  if (!v) throw new ApiError("bad_input", "Unknown verdict. Run a check first.");
  const label = labelFromHost(body.host, getConfig().baseDomain);
  const row = (await db.query<ExposureRow>(
    `INSERT INTO exposures (user_id, url, host, label, field_types, score, verdict, verdict_id, watch, user_action)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [ctx.userId, body.url, body.host.toLowerCase(), label, body.fieldTypes, v.payload.score, verdictLabel(v.payload.score), v.id, body.action === "watch", body.action],
  )).rows[0];

  let alert: string | undefined;
  if (row.score < 40) {
    const intel = await domainIntel(row.host, { userId: ctx.userId, db }).catch(() => null);
    const n = await notify(db, {
      userId: ctx.userId, eventKey: `exposure:${row.id}`, verdictId: v.id, meta: { exposure_id: row.id },
      body: exposureAlert({ fieldTypes: row.field_types, host: row.host, ageDays: intel?.age_days ?? null }),
    });
    alert = n.status === "queued" ? "queued" : `skipped:${n.reason}`;
    if (n.status === "queued") void n.done;
  }
  return json(ctx, { exposure: toExposureDto(row), alert }, { status: 201 });
});
