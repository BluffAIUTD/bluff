/** Minimal typings for the few chrome.* APIs the extension uses (keeps the project free of a heavy @types dependency). */
type BluffMsg = { type: string; attempt?: number; event?: { event: string; data: unknown }; payload?: Record<string, unknown> };
declare const chrome: {
  storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  runtime: {
    sendMessage(msg: BluffMsg): Promise<unknown>;
    onMessage: { addListener(fn: (msg: BluffMsg, sender: { tab?: { id?: number } }, sendResponse: (r: unknown) => void) => boolean | void): void };
  };
  tabs: { sendMessage(tabId: number, msg: BluffMsg): Promise<unknown> };
};
/** The app the extension talks to, baked in at build time (BLUFF_APP_URL's origin). */
declare const __BLUFF_APP__: string;
declare const __BLUFF_VERSION__: string;
