import { ApiError, handle } from "@/lib/errors";
import { getUserContext } from "@/lib/api/helpers";
import { withSession } from "@/lib/session";
import { subscribeScan, type ScanEvent } from "@/lib/scan";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 10_000;

/** One SSE stream for a whole bank scan: merchants, crawl progress, basic checks and deep-review steps for every site. */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await getUserContext(req);
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new ApiError("not_found", "Scan not found");
  const enc = new TextEncoder();
  let unsub: (() => void) | null = null;
  let hb: NodeJS.Timeout | undefined;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => { if (closed) return; closed = true; clearInterval(hb); unsub?.(); try { controller.close(); } catch { /* closed */ } };
      const send = (e: ScanEvent | { type: "error"; data: { message: string } }) => {
        if (closed) return;
        controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
        if (e.type === "done") setTimeout(close, 0);
      };
      hb = setInterval(() => { if (!closed) controller.enqueue(enc.encode(": ping\n\n")); }, HEARTBEAT_MS);
      req.signal.addEventListener("abort", close, { once: true });
      const u = subscribeScan(id, ctx.userId, send);
      if (!u) { send({ type: "error", data: { message: "Scan not found" } }); close(); return; }
      unsub = u;
      if (closed) u();
    },
    cancel() { closed = true; clearInterval(hb); unsub?.(); },
  });
  return withSession(new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } }), ctx);
});
