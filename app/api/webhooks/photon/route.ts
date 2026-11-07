import { getConfig } from "@/lib/config";
import { errorResponse, handle } from "@/lib/errors";
import { getPool } from "@/lib/db";
import { handleInbound } from "@/lib/photon/inbound";
import { parseInbound, verifySignature } from "@/lib/photon/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Verifies the signing secret, answers 200 immediately, and processes the message asynchronously. */
export const POST = handle(async (req: Request) => {
  const c = getConfig();
  const raw = await req.text();
  if (c.photonMode === "live" || c.photon.webhookSecret) {
    const header = req.headers.get(process.env.PHOTON_SIGNATURE_HEADER || "x-photon-signature");
    if (!c.photon.webhookSecret) return errorResponse("upstream_down", "Webhook secret is not configured");
    if (!verifySignature(raw, header, c.photon.webhookSecret)) return errorResponse("forbidden", "Bad signature");
  }
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return errorResponse("bad_input", "Body must be JSON"); }
  const msg = parseInbound(payload);
  if (!msg) return errorResponse("bad_input", "Unrecognized message payload");
  void handleInbound(getPool(), msg).catch((e) => console.error("[webhook] processing failed", e.message));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "content-type": "application/json" } });
});
