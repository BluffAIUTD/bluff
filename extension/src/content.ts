import { computePageSignals, sensitiveFieldTypes, shouldRun } from "./detect";
import { Panel, type PanelState } from "./panel";
import { ALLOWLIST_HOSTS } from "../../data/stores";

/** Content script: idle until a sensitive field appears, then asks the background worker to investigate. */
(async () => {
  const appHost = new URL(__BLUFF_APP__).hostname;
  const host = location.hostname.toLowerCase().replace(/^www\./, "");
  const { safeHosts = [] } = (await chrome.storage.local.get("safeHosts")) as { safeHosts?: string[] };
  if (!shouldRun(host, { safeHosts, allowlist: ALLOWLIST_HOSTS, appHost })) return;
  if (sessionStorage.getItem(`bluff-dismissed:${host}`)) return;

  let started = false;
  let panel: Panel | null = null;
  let fieldTypes: string[] = [];
  let verdictId: string | null = null;
  const url = location.href;

  const show = (s: PanelState) => { if (!panel) panel = new Panel({
    onLeave: () => { sessionStorage.setItem(`bluff-dismissed:${host}`, "1"); panel?.close(); panel = null; history.length > 1 ? history.back() : undefined; },
    onClose: () => { sessionStorage.setItem(`bluff-dismissed:${host}`, "1"); panel?.close(); panel = null; },
    onSafe: async () => { await chrome.storage.local.set({ safeHosts: [...safeHosts, host] }); panel?.close(); panel = null; },
    onContinue: async (watch) => {
      const r = (await chrome.runtime.sendMessage({ type: "expose", payload: { verdictId, url, host, fieldTypes, action: watch ? "watch" : "continue" } })) as { ok: boolean; message?: string };
      show(r.ok ? { phase: "logged", host, watch, dashboardUrl: `${__BLUFF_APP__}/exposure` } : { phase: "error", host, message: r.message ?? "Couldn't log this." });
    },
  }); panel.render(s); };

  const steps: { tool: string | null; output: string }[] = [];
  chrome.runtime.onMessage.addListener((m) => {
    if (m.type !== "bluff:event" || !m.event) return;
    const { event } = m.event;
    const data = m.event.data as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    if (event === "step") { steps.push({ tool: data.tool, output: data.outputSummary }); show({ phase: "running", steps: [...steps], host }); }
    else if (event === "verdict") show({ phase: "done", verdict: data, verdictId, host });
    else if (event === "error") show({ phase: "done", verdict: data.fallbackVerdict ?? { score: 50, verdict: "unsure", confidence: 0.3, confidence_reason: "AI check unavailable", evidence: [data.message, "No verdict could be made", "Only the domain and yes/no signals were sent"], next_steps: ["Don't enter details yet", "Check the company on its official app"], mode: "basic" }, verdictId, host, basicNote: "AI check unavailable, so this is a basic check." });
    else if (event === "done") { verdictId = data.verdictId ?? null; show({ phase: "done", verdict: (panelVerdict ?? undefined) as never, verdictId, host }); }
  });
  let panelVerdict: unknown = null;
  chrome.runtime.onMessage.addListener((m) => { if (m.type === "bluff:event" && m.event?.event === "verdict") panelVerdict = m.event.data; });

  const check = () => {
    if (started) return;
    const types = sensitiveFieldTypes(document);
    if (!types.length) return;
    started = true; fieldTypes = types;
    const signals = computePageSignals(document, location);
    show({ phase: "running", steps: [], host });
    void chrome.runtime.sendMessage({ type: "investigate", payload: { url, host, fieldTypes: types, signals } });
  };

  let t: number | undefined;
  const obs = new MutationObserver(() => { window.clearTimeout(t); t = window.setTimeout(check, 400); });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  check();
})();
