"use client";
import type { StepEvent } from "@/lib/schemas";
import { RadarSweep } from "../shell/RadarSweep";
import { useDockPublish, type DockRun } from "../shell/TraceDock";

const fmt = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);

/**
 * Radar sweep + live trace. Each agent step pings in as a mono line with its own timing delta; the same lines are mirrored to
 * the Agent Trace dock (right rail on wide screens, bottom sheet on phones).
 */
export function AgentTrace({ steps, running, totalMs, slow, label, dock }: {
  steps: StepEvent[]; running: boolean; totalMs?: number | null; slow?: boolean; label?: string;
  dock?: { title: string; source: DockRun["source"]; mode?: string | null; score?: number | null; tone?: DockRun["tone"] };
}) {
  const published: DockRun | null = dock
    ? {
        title: dock.title, source: dock.source, running, mode: dock.mode, totalMs, score: dock.score, tone: dock.tone,
        lines: steps.map((s) => ({ id: String(s.seq), tag: s.tool ?? s.kind, text: s.outputSummary, ms: s.ms, tone: s.kind === "final" ? "safe" : undefined })),
      }
    : null;
  useDockPublish(published);

  return (
    <section aria-label="Agent trace" className={`panel overflow-hidden ${running ? "panel-glow-safe" : ""}`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <RadarSweep state={running ? "scanning" : steps.length ? "done" : "idle"} tone={dock?.tone ?? "neutral"} pings={steps.length} size={40} />
        <div className="min-w-0 flex-1">
          <h3 className="label">{label ?? "Agent trace"}</h3>
          <p className="mono truncate text-xs text-dim">{running ? (steps.length === 0 ? "sweep started" : `${steps.length} step${steps.length === 1 ? "" : "s"} resolved`) : `${steps.length} step${steps.length === 1 ? "" : "s"}`}</p>
        </div>
        {running && <span className="mono inline-flex items-center gap-1.5 text-[11px] text-safe"><span className="live-dot h-1.5 w-1.5 rounded-full bg-safe" />RUNNING</span>}
      </header>
      <ol role="log" aria-live="polite" className="mono flex flex-col gap-0.5 p-2 text-[12.5px] leading-relaxed sm:p-3">
        {steps.map((s, i) => (
          <li key={s.seq} className="ping-in grid grid-cols-[1.5rem_1fr_auto] items-baseline gap-x-2 rounded-control px-2 py-1.5 hover:bg-surface2">
            <span className="text-gray-4">{String(i + 1).padStart(2, "0")}</span>
            <span className="min-w-0">
              <span className={`font-semibold ${s.kind === "final" ? "text-safe" : s.kind === "plan" ? "text-gray-3" : "text-accent"}`}>{s.tool ?? s.kind}</span>
              <span className="ml-2 break-words text-dim" title={s.inputSummary}>{s.inputSummary}</span>
            </span>
            <span className="num text-dim">+{fmt(s.ms)}</span>
            <span className="col-start-2 col-end-4 break-words text-fg">→ {s.outputSummary}</span>
          </li>
        ))}
        {running && (
          <li className="flex items-center gap-2 px-2 py-1.5 text-dim">
            <span aria-hidden className="cursor-blink text-accent">▍</span>
            {steps.length === 0 ? "Starting…" : "Thinking…"}
            {slow && <span className="ml-2 text-unsure">Taking longer than usual</span>}
          </li>
        )}
        {!running && steps.length > 0 && (
          <li className="px-2 py-1.5 text-safe">✓ Verdict ready{totalMs != null ? ` · ${(totalMs / 1000).toFixed(1)} s` : ""}</li>
        )}
      </ol>
    </section>
  );
}
