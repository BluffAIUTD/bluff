import { autoRuns, computePageSignals, sensitiveFieldTypes } from "./detect";
import { Chip, Panel, type PanelState, type PanelVerdict } from "./panel";
import { basicFindings } from "./basic";
import { loggedLinks } from "./links";
import type { PageSignals } from "../../lib/rules/signals";

/** How long the panel waits for a finished check before falling back. The server's own page-check limit is 36 s. */
export const STALL_MS = 45_000;

export type GuardEnv = {
  doc: Document;
  loc: { origin: string; hostname: string; protocol: string };
  /** The Bluff app's origin (__BLUFF_APP__). */
  app: string;
  /** chrome.runtime.sendMessage: talks to the background worker. */
  send(msg: BluffMsg): Promise<unknown>;
  saveSafeHost(host: string): Promise<void>;
  session: { getItem(k: string): string | null; setItem(k: string, v: string): void };
  goBack(): void;
  stallMs?: number;
};

type Reply = { ok?: boolean; runId?: string; message?: string } | undefined;
type Snapshot = { run: { verdictId: string | null }; verdict: PanelVerdict | null };
type EventData = { tool?: string | null; outputSummary?: string; message?: string; fallbackVerdict?: PanelVerdict; verdictId?: string };

export const normHost = (h: string) => h.toLowerCase().replace(/^www\./, "");
export const dismissKey = (host: string) => `bluff-dismissed:${host}`;
const BASIC_NOTE = "This is Bluff's basic check (rules only).";

/**
 * The content script's state machine: idle → (card/CVV/SSN field: check automatically | other sensitive field: chip)
 * → running → verdict (or the server's basic-check fallback) → done → logged. Closing it keeps it closed; a check that
 * doesn't finish in STALL_MS asks the server for the saved run once, then falls back to local findings + Try again.
 */
export function createGuard(env: GuardEnv) {
  const host = normHost(env.loc.hostname);
  const url = `${env.loc.origin}/`; // the page's origin only: never its path, query or hash
  let panel: Panel | null = null;
  let chip: Chip | null = null;
  let chipHidden = false;
  let dismissed = false;
  let started = false;
  let attempt = 0;
  let finished = false;
  let runId: string | null = null;
  let fieldTypes: string[] = [];
  let signals: PageSignals = {};
  let steps: { tool: string | null; output: string }[] = [];
  let verdict: PanelVerdict | null = null;
  let verdictId: string | null = null;
  let basicNote: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const show = (s: PanelState) => {
    if (dismissed) return; // closed stays closed, whatever the stream still sends
    if (!panel) panel = new Panel({ onLeave, onClose, onSafe, onContinue, onRetry }, env.doc);
    panel.render(s);
  };
  const showVerdict = (v: PanelVerdict) => show({ phase: "done", verdict: v, verdictId, host, basicNote, retry: finished && !verdictId });

  function dismiss() {
    dismissed = true;
    clearTimeout(timer);
    panel?.close(); panel = null;
    chip?.close(); chip = null;
  }
  function onClose() { env.session.setItem(dismissKey(host), "1"); dismiss(); }
  function onLeave() { onClose(); env.goBack(); }
  async function onSafe() { dismiss(); await env.saveSafeHost(host); }
  function onRetry() { if (!dismissed) void run(); }
  async function onContinue(watch: boolean) {
    if (!verdictId) return;
    const r = (await env.send({ type: "expose", payload: { verdictId, url, host, fieldTypes, action: watch ? "watch" : "continue" } })
      .catch((e: Error) => ({ ok: false, message: e.message }))) as Reply;
    if (r?.ok) show({ phase: "logged", host, watch, ...loggedLinks(env.app, host) });
    else show({ phase: "error", host, message: r?.message ?? "Couldn't log this." });
  }

  /** End the attempt without a saved verdict: keep a verdict we already showed (Continue off), else local findings. */
  function stall(message: string) {
    finished = true;
    clearTimeout(timer);
    if (verdict) { basicNote = basicNote ?? `${message} Continue needs a saved check, so try again.`; showVerdict(verdict); return; }
    show({ phase: "stalled", host, message, findings: basicFindings(signals, host) });
  }

  async function onTimeout(a: number) {
    if (a !== attempt || finished || dismissed) return;
    // The background worker may have been stopped mid-stream; the run itself finishes on the server, so ask for it.
    if (runId) {
      const r = (await env.send({ type: "snapshot", payload: { runId } }).catch(() => undefined)) as { ok?: boolean; snapshot?: Snapshot } | undefined;
      if (a !== attempt || finished || dismissed) return;
      const snap = r?.ok ? r.snapshot : undefined;
      if (snap?.verdict && snap.run.verdictId) {
        finished = true;
        verdict = snap.verdict; verdictId = snap.run.verdictId;
        basicNote = snap.verdict.mode === "basic" ? `The AI check didn't finish. ${BASIC_NOTE}` : undefined;
        showVerdict(verdict);
        return;
      }
    }
    stall(`Bluff couldn't finish checking ${host}.`);
  }

  async function run() {
    const a = ++attempt;
    finished = false; runId = null; steps = []; verdict = null; verdictId = null; basicNote = undefined;
    clearTimeout(timer);
    fieldTypes = sensitiveFieldTypes(env.doc);
    signals = computePageSignals(env.doc, env.loc);
    show({ phase: "running", steps: [], host });
    timer = setTimeout(() => void onTimeout(a), env.stallMs ?? STALL_MS);
    const r = (await env.send({ type: "investigate", attempt: a, payload: { url, host, fieldTypes, signals } })
      .catch((e: Error) => ({ ok: false, message: e.message }))) as Reply;
    if (a !== attempt || finished) return;
    if (r?.ok && r.runId) runId = r.runId;
    else if (r?.ok === false) stall(r.message ?? "Couldn't reach Bluff.");
  }

  /** A stream event forwarded by the background worker ({ type: "bluff:event", attempt, event }). */
  function onEvent(m: BluffMsg) {
    if (!m.event || m.attempt !== attempt || finished) return;
    const data = (m.event.data ?? {}) as EventData;
    switch (m.event.event) {
      case "step":
        steps.push({ tool: data.tool ?? null, output: String(data.outputSummary ?? "") });
        if (!verdict) show({ phase: "running", steps: [...steps], host });
        break;
      case "verdict":
        verdict = m.event.data as PanelVerdict; basicNote = undefined;
        showVerdict(verdict);
        break;
      case "error":
        // Timeout or model failure: the server sends its basic check as fallbackVerdict, then `done` with the saved id.
        if (data.fallbackVerdict) { verdict = data.fallbackVerdict; basicNote = `${data.message ?? "The AI check didn't finish."} ${BASIC_NOTE}`; showVerdict(verdict); }
        else stall(data.message ?? "Bluff couldn't finish this check.");
        break;
      case "done":
        if (!verdict) { stall("Bluff couldn't finish this check."); break; }
        finished = true; clearTimeout(timer);
        verdictId = data.verdictId ?? null;
        showVerdict(verdict);
        break;
    }
  }

  /** Called on load and (debounced) on DOM changes. */
  function check() {
    if (started || dismissed) return;
    const types = sensitiveFieldTypes(env.doc);
    if (!types.length) return;
    if (autoRuns(types)) {
      started = true;
      chip?.close(); chip = null;
      void run();
    } else if (!chip && !chipHidden) {
      chip = new Chip({
        onCheck: () => { chip?.close(); chip = null; started = true; void run(); },
        onClose: () => { chip?.close(); chip = null; chipHidden = true; },
      }, env.doc);
    }
  }

  return { check, onEvent, get dismissed() { return dismissed; } };
}
