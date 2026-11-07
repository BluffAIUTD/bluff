import { SseParser } from "./sse";

const APP = __BLUFF_APP__;

async function postJson(path: string, body: unknown) {
  const r = await fetch(`${APP}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), credentials: "include" });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.error?.message ?? `Bluff returned ${r.status}`);
  return j;
}

async function stream(tabId: number, runId: string) {
  const res = await fetch(`${APP}/api/runs/${runId}/stream`, { credentials: "include" });
  if (!res.ok || !res.body) throw new Error("Couldn't open the check stream");
  const reader = res.body.getReader(); const dec = new TextDecoder(); const p = new SseParser();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const ev of p.push(dec.decode(value, { stream: true }))) {
      void chrome.tabs.sendMessage(tabId, { type: "bluff:event", event: ev });
      if (ev.event === "done") return;
    }
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id;
  if (msg.type === "investigate" && tabId != null) {
    // Only the domain, field *types* and yes/no signals leave the page (never values or page text).
    const { url, host, fieldTypes, signals } = msg.payload as { url: string; host: string; fieldTypes: string[]; signals: Record<string, unknown> };
    postJson("/api/investigate/page", { url, host, fieldTypes, signals, source: "extension" })
      .then((r) => stream(tabId, r.runId))
      .catch((e: Error) => void chrome.tabs.sendMessage(tabId, { type: "bluff:event", event: { event: "error", data: { code: "upstream_down", message: e.message } } }));
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === "expose") {
    postJson("/api/exposures", msg.payload).then(() => sendResponse({ ok: true })).catch((e: Error) => sendResponse({ ok: false, message: e.message }));
    return true; // async response
  }
  return false;
});
