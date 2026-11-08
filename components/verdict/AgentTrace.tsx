"use client";
import type { StepEvent } from "@/lib/schemas";

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/**
 * Streams each agent step: tool, one-line input, one-line result, ms; ends with "Verdict ready" and the total time.
 * One raised panel; steps are separated by hairlines instead of nested dark rows, tool names are letterspaced small caps,
 * and the result line carries the contrast.
 */
export function AgentTrace({ steps, running, totalMs, slow, label }: { steps: StepEvent[]; running: boolean; totalMs?: number | null; slow?: boolean; label?: string }) {
  return (
    <section aria-label="Agent trace" className="rounded-card border brass-hairline bg-surface px-5 pb-2 pt-5 sm:px-6">
      <h3 className="font-grotesk uppercase text-brass">{label ?? "Agent trace"}</h3>
      <ol role="log" aria-live="polite" className="mt-2 flex flex-col divide-y divide-[rgba(217,180,107,0.2)]">
        {steps.map((s) => (
          <li key={s.seq} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1.5 py-3.5">
            <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${s.kind === "final" ? "text-[#8fe3b8]" : s.kind === "plan" ? "text-dim" : "text-[#f1d894]"}`}>{s.tool ?? s.kind}</span>
            <span className="min-w-0 truncate font-mono text-xs text-dim" title={s.inputSummary}>{s.inputSummary}</span>
            <span className="num text-xs text-dim">{fmt(s.ms)}</span>
            <span className="col-span-3 text-[15px] leading-relaxed text-fg">→ {s.outputSummary}</span>
          </li>
        ))}
        {running && (
          <li className="flex items-center gap-2.5 py-3.5 text-sm text-dim">
            <span aria-hidden className="skeleton inline-block h-2 w-2 rounded-full bg-accent" />
            {steps.length === 0 ? "Starting…" : "Thinking…"}
            {slow && <span className="ml-2 text-unsure">Taking longer than usual</span>}
          </li>
        )}
        {!running && steps.length > 0 && (
          <li className="py-3.5 text-sm font-semibold text-[#8fe3b8]">✓ Verdict ready{totalMs != null ? ` · ${(totalMs / 1000).toFixed(1)} s` : ""}</li>
        )}
      </ol>
    </section>
  );
}
