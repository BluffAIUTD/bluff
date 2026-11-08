import { shouldRun } from "./detect";
import { createGuard, dismissKey, normHost } from "./guard";
import { appHostname } from "./links";
import { ALLOWLIST_HOSTS } from "../../data/stores";

/** Content script: idle until a card/CVV/SSN field appears (or the user clicks the chip), then checks the store. */
(async () => {
  if (!/^https?:$/.test(location.protocol)) return; // web pages only (not file:// or other schemes)
  const host = normHost(location.hostname);
  const { safeHosts = [] } = (await chrome.storage.local.get("safeHosts")) as { safeHosts?: string[] };
  if (!shouldRun(host, { safeHosts, allowlist: ALLOWLIST_HOSTS, appHost: appHostname(__BLUFF_APP__) })) return;
  if (sessionStorage.getItem(dismissKey(host))) return;

  const guard = createGuard({
    doc: document,
    loc: location,
    app: __BLUFF_APP__,
    send: (msg) => chrome.runtime.sendMessage(msg),
    saveSafeHost: async (h) => {
      const { safeHosts: now = [] } = (await chrome.storage.local.get("safeHosts")) as { safeHosts?: string[] };
      await chrome.storage.local.set({ safeHosts: [...new Set([...now, h])] });
    },
    session: sessionStorage,
    goBack: () => { if (history.length > 1) history.back(); },
  });
  chrome.runtime.onMessage.addListener((m) => { if (m.type === "bluff:event") guard.onEvent(m); });

  let t: number | undefined;
  const obs = new MutationObserver(() => {
    if (guard.dismissed) { obs.disconnect(); return; }
    window.clearTimeout(t); t = window.setTimeout(guard.check, 400);
  });
  obs.observe(document.documentElement, { childList: true, subtree: true });
  guard.check();
})();
