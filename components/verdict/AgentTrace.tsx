"use client";
import type { StepEvent } from "@/lib/schemas";

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/** Streams each agent step as a line in the investigator's log: tool, one-line input, one-line result, ms; ends with "Verdict ready" and the total time. */
export function AgentTrace({ steps, running, totalMs, slow, label }: { steps: StepEvent[]; running: boolean; totalMs?: number | null; slow?: boolean; label?: string }) {
  return (
    <section aria-label="Agent trace" className="dossier p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between border-b border-line pb-2">
        <h3 className="eyebrow">{label ?? "Agent trace"}</h3>
        <span className="eyebrow text-gray-5">Field log</span>
      </div>
      <ol role="log" aria-live="polite" className="flex flex-col font-mono text-[13px]">
        {steps.map((s) => (
          <li key={s.seq} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 border-b border-dashed border-line py-2 last:border-b-0">
            <span className={`font-bold ${s.kind === "final" ? "text-safe" : s.kind === "plan" ? "text-dim" : "text-accent"}`}>{s.tool ?? s.kind}</span>
            <span className="min-w-0 truncate text-dim" title={s.inputSummary}>{s.inputSummary}</span>
            <span className="num text-xs text-dim">{fmt(s.ms)}</span>
            <span className="col-span-3 pt-0.5 text-fg">→ {s.outputSummary}</span>
          </li>
        ))}
        {running && (
          <li className="flex items-center gap-2 py-2 text-dim">
            <span aria-hidden className="skeleton inline-block h-2 w-2 rounded-full bg-scam" />
            {steps.length === 0 ? "Starting…" : "Thinking…"}
            {slow && <span className="ml-2 text-unsure">Taking longer than usual</span>}
          </li>
        )}
        {!running && steps.length > 0 && (
          <li className="pt-2 font-bold text-safe">✓ Verdict ready{totalMs != null ? ` · ${(totalMs / 1000).toFixed(1)} s` : ""}</li>
        )}
      </ol>
    </section>
  );
}
