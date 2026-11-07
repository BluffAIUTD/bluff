import { NextResponse } from "next/server";
import { getConfig } from "@/lib/config";
import { getPool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness + database check for Docker/Caddy and the smoke test. */
export async function GET() {
  const c = getConfig();
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ ok: true, db: true, agentMode: c.agentMode, photonMode: c.photonMode });
  } catch {
    return NextResponse.json({ ok: false, db: false, agentMode: c.agentMode, photonMode: c.photonMode }, { status: 503 });
  }
}
