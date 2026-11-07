"use client";
import type { StepEvent } from "@/lib/schemas";

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/** Streams each agent step: tool, one-line input, one-line result, ms; ends with "Verdict ready" and the total time. */
export function AgentTrace({ steps, running, totalMs, slow, label }: { steps: StepEvent[]; running: boolean; totalMs?: number | null; slow?: boolean; label?: string }) {
  return (
    <section aria-label="Agent trace" className="rounded-card border border-line bg-surface p-4">
      <h3 className="mb-3 font-grotesk text-sm font-medium uppercase tracking-wide text-dim">{label ?? "Agent trace"}</h3>
      <ol role="log" aria-live="polite" className="flex flex-col gap-2 font-mono text-[13px]">
        {steps.map((s) => (
          <li key={s.seq} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-0 rounded-control bg-surface2 px-3 py-2">
            <span className={`font-semibold ${s.kind === "final" ? "text-safe" : s.kind === "plan" ? "text-dim" : "text-accent"}`}>{s.tool ?? s.kind}</span>
            <span className="min-w-0 truncate text-dim" title={s.inputSummary}>{s.inputSummary}</span>
            <span className="num text-xs text-dim">{fmt(s.ms)}</span>
            <span className="col-span-3 text-fg">→ {s.outputSummary}</span>
          </li>
        ))}
        {running && (
          <li className="flex items-center gap-2 px-3 py-2 text-dim">
            <span aria-hidden className="skeleton inline-block h-2 w-2 rounded-full bg-accent" />
            {steps.length === 0 ? "Starting…" : "Thinking…"}
            {slow && <span className="ml-2 text-unsure">Taking longer than usual</span>}
          </li>
        )}
        {!running && steps.length > 0 && (
          <li className="px-3 py-1 text-safe">✓ Verdict ready{totalMs != null ? ` · ${(totalMs / 1000).toFixed(1)} s` : ""}</li>
        )}
      </ol>
    </section>
  );
}
