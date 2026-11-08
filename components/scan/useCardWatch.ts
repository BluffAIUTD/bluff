"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";

export type WatchResponse = {
  configured: boolean; checkedAt: string | null; scanId: string | null; newTxnIds: string[];
  imported: number; firstSync: boolean; throttled: boolean; error?: string;
};

export const WATCH_INTERVAL_MS = 20_000;

/**
 * Polls POST /api/scan/watch every 20 s while `enabled` and the page is visible (paused while hidden; checks right away
 * when the tab comes back after 20 s or more). `onResult` gets every answer (a new partial scan id, imported rows).
 */
export function useCardWatch(enabled: boolean, onResult: (r: WatchResponse) => void) {
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [configured, setConfigured] = useState(true);
  const cb = useRef(onResult);
  cb.current = onResult;
  const lastPoll = useRef(0);
  const inflight = useRef(false);

  const poll = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    lastPoll.current = Date.now();
    try {
      const r = await api<WatchResponse>("/api/scan/watch", { method: "POST" });
      setConfigured(r.configured);
      if (r.checkedAt) setCheckedAt(r.checkedAt);
      setError(r.error ?? null);
      cb.current(r);
    } catch (e) {
      setError(e instanceof ApiFailure ? e.message : "Couldn't check for new charges.");
    } finally {
      inflight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const due = () => document.visibilityState === "visible" && Date.now() - lastPoll.current >= WATCH_INTERVAL_MS - 1_000;
    const t = setInterval(() => { if (due()) void poll(); }, 5_000);
    const vis = () => { if (due()) void poll(); };
    document.addEventListener("visibilitychange", vis);
    vis();
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [enabled, poll]);

  return { checkedAt, error, configured };
}
