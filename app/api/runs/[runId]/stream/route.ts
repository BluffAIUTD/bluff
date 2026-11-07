import { ApiError, handle } from "@/lib/errors";
import { getContext } from "@/lib/api/helpers";
import { withSession } from "@/lib/session";
import { subscribe } from "@/lib/agent/runs";
import type { RunStreamEvent } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 10_000;

export const GET = handle(async (req: Request, { params }: { params: Promise<{ runId: string }> }) => {
  const ctx = getContext(req);
  const { runId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new ApiError("not_found", "Run not found");
  const enc = new TextEncoder();
  let unsub: (() => void) | null = null;
  let hb: NodeJS.Timeout | undefined;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const close = () => { if (closed) return; closed = true; clearInterval(hb); unsub?.(); try { controller.close(); } catch { /* already closed */ } };
      const send = (e: RunStreamEvent) => {
        if (closed) return;
        controller.enqueue(enc.encode(`event: ${e.type}\ndata: ${JSON.stringify(e.data)}\n\n`));
        if (e.type === "done") setTimeout(close, 0);
      };
      hb = setInterval(() => { if (!closed) controller.enqueue(enc.encode(": ping\n\n")); }, HEARTBEAT_MS);
      req.signal.addEventListener("abort", close, { once: true });
      const u = await subscribe(runId, send);
      if (!u) { send({ type: "error", data: { code: "not_found", message: "Run not found" } }); close(); return; }
      unsub = u;
      if (closed) u();
    },
    cancel() { closed = true; clearInterval(hb); unsub?.(); },
  });

  return withSession(new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", connection: "keep-alive", "x-accel-buffering": "no" } }), ctx);
});
