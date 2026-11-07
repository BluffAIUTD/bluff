"use client";
import { useEffect, useReducer, useState } from "react";
import { initialRunState, runReducer, type RunState } from "./runState";

export const SLOW_AFTER_MS = 12_000;
export const GIVE_UP_AFTER_MS = 40_000;

export type RunStream = RunState & { running: boolean; slow: boolean };

/**
 * Subscribes to GET /api/runs/:id/stream. Returns {steps, verdict, error, done, mode, ...}.
 * `slow` flips after 12 s ("Taking longer than usual"); after 40 s without `done` the client gives up with a timeout error.
 */
export function useRunStream(runId: string | null): RunStream {
  const [state, dispatch] = useReducer(runReducer, initialRunState);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    dispatch({ type: "reset" });
    setSlow(false);
    if (!runId) return;
    const es = new EventSource(`/api/runs/${encodeURIComponent(runId)}/stream`);
    let finished = false;
    const parse = (ev: MessageEvent) => { try { return JSON.parse(ev.data); } catch { return null; } };
    es.addEventListener("step", (ev) => { const d = parse(ev as MessageEvent); if (d) dispatch({ type: "step", data: d }); });
    es.addEventListener("verdict", (ev) => { const d = parse(ev as MessageEvent); if (d) dispatch({ type: "verdict", data: d }); });
    es.addEventListener("error", (ev) => {
      const d = "data" in ev ? parse(ev as MessageEvent) : null;
      if (d) { dispatch({ type: "error", data: d }); return; }
      // Transport error (no payload): EventSource retries by itself; only fail if the connection is closed for good.
      if (es.readyState === EventSource.CLOSED && !finished) dispatch({ type: "client_error", data: { code: "upstream_down", message: "Lost connection to the check." } });
    });
    es.addEventListener("done", (ev) => { finished = true; const d = parse(ev as MessageEvent); if (d) dispatch({ type: "done", data: d }); es.close(); });
    const slowT = setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    const giveUp = setTimeout(() => { if (!finished) { es.close(); dispatch({ type: "client_error", data: { code: "timeout", message: "The check took too long." } }); } }, GIVE_UP_AFTER_MS);
    return () => { finished = true; clearTimeout(slowT); clearTimeout(giveUp); es.close(); };
  }, [runId]);

  return { ...state, running: !!runId && !state.done, slow: slow && !state.done };
}
