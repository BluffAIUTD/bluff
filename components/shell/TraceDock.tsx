"use client";
import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { shortDate } from "@/lib/format";
import { Icon } from "./Icon";
import { RadarSweep } from "./RadarSweep";
import { EVT, fire } from "./nav";

export type DockLine = { id: string; tag: string; text: string; ms?: number | null; tone?: "safe" | "scam" | "unsure" };
export type DockRun = {
  title: string; source: "check" | "charge" | "scan"; running: boolean; lines: DockLine[];
  mode?: string | null; totalMs?: number | null; score?: number | null; tone?: "safe" | "scam" | "unsure";
};

type Ctx = { run: DockRun | null; publish: (r: DockRun | null) => void; sheet: boolean; setSheet: (b: boolean) => void; collapsed: boolean; toggle: () => void };
const DockCtx = createContext<Ctx>({ run: null, publish: () => {}, sheet: false, setSheet: () => {}, collapsed: false, toggle: () => {} });

export function TraceDockProvider({ children }: { children: ReactNode }) {
  const [run, setRun] = useState<DockRun | null>(null);
  const [sheet, setSheet] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { try { setCollapsed(localStorage.getItem("bluff.dock") === "0"); } catch { /* storage unavailable */ } }, []);
  const toggle = useCallback(() => setCollapsed((c) => { try { localStorage.setItem("bluff.dock", c ? "1" : "0"); } catch { /* ignore */ } return !c; }), []);
  const publish = useCallback((r: DockRun | null) => setRun(r), []);
  const v = useMemo(() => ({ run, publish, sheet, setSheet, collapsed, toggle }), [run, publish, sheet, collapsed, toggle]);
  return <DockCtx.Provider value={v}>{children}</DockCtx.Provider>;
}

/** Components that own a run (AgentTrace, ScanClient) publish it here; it is cleared when they unmount. */
export function useDockPublish(run: DockRun | null) {
  const { publish } = useContext(DockCtx);
  const key = run ? JSON.stringify(run) : "";
  const ref = useRef(run);
  ref.current = run;
  useEffect(() => { publish(ref.current); }, [key, publish]);
  useEffect(() => () => publish(null), [publish]);
}

type Exposure = { id: string; host: string; score: number; createdAt: string; watch: boolean };
type Msg = { id: string; direction: "in" | "out"; kind: string; status: string; createdAt: string };

const clock = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Chicago" }).format(new Date(iso));
const toneOfScore = (s: number) => (s < 40 ? "text-scam" : s < 70 ? "text-unsure" : "text-safe");
const TAG = { safe: "text-safe", scam: "text-scam", unsure: "text-unsure" } as const;
const dur = (ms?: number | null) => (ms == null ? "" : ms >= 1000 ? `+${(ms / 1000).toFixed(1)}s` : `+${ms}ms`);

/** With no active run, show real recent activity (latest exposures and texts sent). Never invented events. */
function useRecent(enabled: boolean) {
  const [ex, setEx] = useState<Exposure[] | null>(null);
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api<{ exposures: Exposure[] }>("/api/exposures"), api<{ messages: Msg[] }>("/api/messages?limit=8")]);
      setEx(a.exposures.slice(0, 5)); setMsgs(b.messages.filter((m) => m.direction === "out").slice(-4).reverse()); setFailed(false);
    } catch { setFailed(true); }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void load();
    const t = setInterval(load, 10_000);
    window.addEventListener(EVT.refresh, load);
    return () => { clearInterval(t); window.removeEventListener(EVT.refresh, load); };
  }, [enabled, load]);
  return { ex, msgs, failed };
}

export function TraceBody({ active }: { active: boolean }) {
  const { run } = useContext(DockCtx);
  const recent = useRecent(active && !run);
  const end = useRef<HTMLDivElement>(null);
  const n = run?.lines.length ?? 0;
  useEffect(() => { end.current?.scrollIntoView({ block: "nearest" }); }, [n, run?.running]);

  if (run) {
    const state = run.running ? "scanning" : "done";
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div className="flex items-center gap-3">
          <RadarSweep state={state} tone={run.tone ?? "neutral"} pings={n} size={64} />
          <div className="min-w-0">
            <p className="label">{run.running ? "Sweeping" : "Resolved"} · {run.source}</p>
            <p className="mono truncate text-sm" title={run.title}>{run.title}</p>
            <p className="mono text-xs text-dim">{run.running ? `${n} step${n === 1 ? "" : "s"} so far` : run.score != null ? `trust ${run.score}/100${run.totalMs != null ? ` in ${(run.totalMs / 1000).toFixed(1)}s` : ""}` : "done"}</p>
          </div>
        </div>
        <ol className="scroll-thin mono flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto text-[12px] leading-snug" aria-label="Live trace">
          {run.lines.map((l) => (
            <li key={l.id} className="ping-in grid grid-cols-[auto_1fr] gap-x-2">
              <span className="text-dim">{dur(l.ms) || "·"}</span>
              <span className="min-w-0 break-words"><span className={l.tone ? TAG[l.tone] : "text-accent"}>{l.tag}</span> <span className="text-gray-2">{l.text}</span></span>
            </li>
          ))}
          {run.running && <li className="mono text-dim">listening<span className="cursor-blink">_</span></li>}
          <div ref={end} />
        </ol>
      </div>
    );
  }

  return (
    <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <div className="flex items-center gap-3">
        <RadarSweep state="idle" size={64} />
        <div>
          <p className="label">Standing by</p>
          <p className="text-sm text-dim">No check is running. Start one from Check or Scan and its steps appear here live.</p>
        </div>
      </div>
      <section aria-label="Recent exposures" className="flex flex-col gap-2">
        <p className="label">Latest exposures</p>
        {recent.ex == null ? <div className="skeleton h-4 w-3/4" /> : recent.ex.length === 0 ? <p className="mono text-xs text-dim">none logged yet</p> : (
          <ul className="mono flex flex-col gap-1.5 text-[12px]">
            {recent.ex.map((e) => (
              <li key={e.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
                <span className="text-dim">{shortDate(e.createdAt)}</span>
                <Link href="/exposure" className="truncate hover:underline">{e.host}</Link>
                <span className={`num ${toneOfScore(e.score)}`}>{e.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Recent alerts" className="flex flex-col gap-2">
        <p className="label">Texts sent to your phone</p>
        {recent.msgs == null ? <div className="skeleton h-4 w-2/3" /> : recent.msgs.length === 0 ? <p className="mono text-xs text-dim">none yet</p> : (
          <ul className="mono flex flex-col gap-1.5 text-[12px]">
            {recent.msgs.map((m) => (
              <li key={m.id} className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2">
                <span className="text-dim">{clock(m.createdAt)}</span>
                <button type="button" onClick={() => fire(EVT.phone)} className="truncate text-left hover:underline">{m.kind === "alert" ? "text alert" : m.kind}</button>
                <span className={m.status === "failed" ? "text-scam" : "text-dim"}>{m.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {recent.failed && <p role="status" className="mono text-xs text-unsure">Activity feed unavailable right now.</p>}
    </div>
  );
}

function Footer() {
  return (
    <Link href="/privacy#sent" className="mono mt-auto flex items-center justify-between rounded-control border border-line px-3 py-2 text-[11px] text-dim hover:border-line2 hover:text-fg">
      <span>What leaves your device</span><Icon name="arrow" className="h-3.5 w-3.5" />
    </Link>
  );
}

/** Persistent right-hand dock (>= 1280px). */
export function TraceDock() {
  const { run, collapsed, toggle } = useContext(DockCtx);
  return (
    <aside aria-label="Agent trace dock" data-collapsed={collapsed} className={`fixed inset-y-0 right-0 z-20 hidden flex-col gap-3 border-l border-line bg-surface/80 p-4 backdrop-blur xl:flex ${collapsed ? "w-14 items-center" : "w-80"}`}>
      <div className="flex w-full items-center justify-between gap-2">
        {!collapsed && <h2 className="label flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${run?.running ? "live-dot bg-safe" : "bg-gray-4"}`} />Agent trace</h2>}
        <button type="button" onClick={toggle} aria-label={collapsed ? "Expand agent trace" : "Collapse agent trace"} aria-expanded={!collapsed} className="grid h-8 w-8 place-items-center rounded-control text-dim hover:bg-surface2 hover:text-fg">
          <Icon name={collapsed ? "trace" : "chevron"} className="h-4 w-4" />
        </button>
      </div>
      {collapsed ? (run?.running ? <span aria-label="A check is running" className="live-dot h-2 w-2 rounded-full bg-safe" /> : null) : (<><TraceBody active /><Footer /></>)}
    </aside>
  );
}

/** Mobile / narrow desktop: floating chip + bottom sheet with the same trace. */
export function TraceSheet() {
  const { run, sheet, setSheet } = useContext(DockCtx);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!sheet) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setSheet(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sheet, setSheet]);
  return (
    <div className="xl:hidden">
      {run && !sheet && (
        <button type="button" onClick={() => setSheet(true)} className="mono fixed bottom-24 right-4 z-30 inline-flex min-h-[40px] items-center gap-2 rounded-full border border-line2 bg-surface3 px-3 text-xs shadow-lg lg:bottom-6">
          <span className={`h-1.5 w-1.5 rounded-full ${run.running ? "live-dot bg-safe" : "bg-gray-4"}`} />
          Trace · {run.lines.length}
        </button>
      )}
      {sheet && mounted && createPortal(
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="Close trace" onClick={() => setSheet(false)} className="fade-in absolute inset-0 bg-black/60" />
          <section role="dialog" aria-modal="true" aria-label="Agent trace" className="sheet-up absolute inset-x-0 bottom-0 flex max-h-[78vh] min-h-[40vh] flex-col gap-3 rounded-t-[20px] border-t border-line2 bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between">
              <h2 className="label">Agent trace</h2>
              <button type="button" onClick={() => setSheet(false)} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-control text-dim hover:bg-surface2"><Icon name="close" className="h-4 w-4" /></button>
            </div>
            <TraceBody active />
            <Footer />
          </section>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** Pads the page so content never sits under the fixed dock. */
export function DockPad({ children }: { children: ReactNode }) {
  const { collapsed } = useContext(DockCtx);
  return <div className={`lg:pl-16 ${collapsed ? "xl:pr-14" : "xl:pr-80"}`}>{children}</div>;
}
