"use client";
import { useEffect, type ReactNode } from "react";
import { useRunStream } from "@/lib/client/useRunStream";
import type { Verdict } from "@/lib/schemas";
import { ErrorState } from "../ui/ErrorState";
import { AgentTrace } from "./AgentTrace";
import { VerdictCard } from "./VerdictCard";

const BANNER: Record<string, string> = {
  timeout: "The AI check took too long, so this is a basic check.",
  malformed: "The AI check returned something unreadable, so this is a basic check.",
  rate_limited: "AI check unavailable right now, so this is a basic check.",
  upstream_down: "AI check unavailable right now, so this is a basic check.",
};

export type RunViewMeta = { verdictId: string | null; mode: string | null; checkedEarlier: boolean };

/** Agent trace + verdict for one run, including every failure state of product_spec §4. */
export function RunView({ runId, subtitle, actions, renderVerdict, onDone, onRetry }: {
  runId: string | null; subtitle?: string; actions?: (v: Verdict, meta: RunViewMeta) => ReactNode;
  renderVerdict?: (v: Verdict, meta: RunViewMeta) => ReactNode; onDone?: (v: Verdict | null, meta: RunViewMeta) => void; onRetry?: () => void;
}) {
  const s = useRunStream(runId);
  const checkedEarlier = s.steps.some((x) => x.tool === "cache");
  const meta: RunViewMeta = { verdictId: s.verdictId, mode: s.mode, checkedEarlier };

  // Fire once when the run completes (onDone intentionally not a dependency: callers pass inline functions).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.done) onDone?.(s.verdict, { verdictId: s.verdictId, mode: s.mode, checkedEarlier }); }, [s.done]);

  if (!runId) return null;
  return (
    <div className="flex flex-col gap-4">
      <AgentTrace steps={s.steps} running={s.running} totalMs={s.totalMs} slow={s.slow} />
      {s.error && s.verdict && <p role="status" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">{BANNER[s.error.code] ?? "AI check unavailable, so this is a basic check."}</p>}
      {s.error && !s.verdict && (
        <ErrorState title="Couldn't finish this check" message={s.error.message} action={onRetry && <button type="button" onClick={onRetry} className="self-start text-sm font-medium text-accent underline">Try again</button>} />
      )}
      {s.verdict && (renderVerdict ? renderVerdict(s.verdict, meta) : <VerdictCard verdict={s.verdict} subtitle={subtitle} checkedEarlier={checkedEarlier} actions={s.done ? actions?.(s.verdict, meta) : undefined} />)}
    </div>
  );
}
