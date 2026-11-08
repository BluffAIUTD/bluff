import { renderPopup } from "./popupView";

/** Toolbar popup. Safe sites live in chrome.storage.local only (never sent to Bluff). */
async function load() {
  const root = document.getElementById("app");
  if (!root) return;
  const { safeHosts = [] } = (await chrome.storage.local.get("safeHosts")) as { safeHosts?: string[] };
  renderPopup(root, {
    app: __BLUFF_APP__,
    version: __BLUFF_VERSION__,
    safeHosts,
    onRemove: async (host) => {
      await chrome.storage.local.set({ safeHosts: safeHosts.filter((h) => h !== host) });
      await load();
    },
  });
}

void load();
