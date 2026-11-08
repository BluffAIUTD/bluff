import { SseParser } from "./sse";
import { originOnly } from "./links";

const APP = __BLUFF_APP__;
const RUN_ID = /^[0-9a-f-]{36}$/i;

async function call(path: string, init: RequestInit = {}) {
  const r = await fetch(`${APP}${path}`, { ...init, credentials: "include" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? `Bluff returned ${r.status}`);
  return j;
}
const postJson = (path: string, body: unknown) => call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** The tab may have navigated away or closed; that is not an error worth surfacing. */
const toTab = (tabId: number, msg: BluffMsg) => chrome.tabs.sendMessage(tabId, msg).catch(() => undefined);

async function stream(tabId: number, runId: string, attempt: number | undefined) {
  const res = await fetch(`${APP}/api/runs/${runId}/stream`, { credentials: "include" });
  if (!res.ok || !res.body) throw new Error("Couldn't open the check stream");
  const reader = res.body.getReader(); const dec = new TextDecoder();
  // The server sends ": ping" every 10 s. Forwarding each one is an extension API call, which keeps this service worker
  // alive while Nemotron works (Chrome stops idle workers after 30 s).
  const p = new SseParser({ onComment: () => void toTab(tabId, { type: "bluff:ping", attempt }) });
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const ev of p.push(dec.decode(value, { stream: true }))) {
      void toTab(tabId, { type: "bluff:event", attempt, event: ev });
      if (ev.event === "done") { void reader.cancel().catch(() => undefined); return; }
    }
  }
  throw new Error("The check stopped before it finished");
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === "investigate" && tabId != null) {
    // Only the site's origin, the field *types* and yes/no signals leave the page (never values, page text or the path).
    const { url, host, fieldTypes, signals } = (msg.payload ?? {}) as { url: string; host: string; fieldTypes: string[]; signals: Record<string, unknown> };
    let answered = false;
    Promise.resolve()
      .then(() => postJson("/api/investigate/page", { url: originOnly(url), host, fieldTypes, signals, source: "extension" }))
      .then((r: { runId: string }) => { answered = true; sendResponse({ ok: true, runId: r.runId }); return stream(tabId, r.runId, msg.attempt); })
      .catch((e: Error) => {
        if (!answered) sendResponse({ ok: false, message: e.message });
        else void toTab(tabId, { type: "bluff:event", attempt: msg.attempt, event: { event: "error", data: { code: "upstream_down", message: e.message } } });
      });
    return true; // async response
  }
  if (msg.type === "snapshot") {
    // After a stall: the saved run (verdict + id) if the server finished it while this worker was stopped.
    const runId = String(msg.payload?.runId ?? "");
    if (!RUN_ID.test(runId)) { sendResponse({ ok: false }); return false; }
    call(`/api/runs/${runId}`).then((snapshot) => sendResponse({ ok: true, snapshot })).catch(() => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === "expose") {
    const p = (msg.payload ?? {}) as Record<string, unknown>;
    Promise.resolve()
      .then(() => postJson("/api/exposures", { ...p, url: originOnly(String(p.url)), source: "extension" }))
      .then(() => sendResponse({ ok: true }))
      .catch((e: Error) => sendResponse({ ok: false, message: e.message }));
    return true;
  }
  return false;
});
