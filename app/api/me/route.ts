import { handle } from "@/lib/errors";
import { getContext } from "@/lib/api/helpers";
import { getPool } from "@/lib/db";
import { resetDemo } from "../../../scripts/seed/seed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delete everything: exposures, verdicts, agent runs, disputes, messages, game plays and allowlist entries for the user
 * (cascade from the user row), then re-seed the demo user so the app stays usable. Note: the demo user is shared (DEMO_MODE).
 */
export const DELETE = handle(async (req: Request) => {
  getContext(req);
  await resetDemo(getPool());
  return new Response(null, { status: 204 });
});
