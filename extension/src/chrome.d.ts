/** Minimal typings for the few chrome.* APIs the extension uses (keeps the project free of a heavy @types dependency). */
type BluffMsg = { type: string; event?: { event: string; data: unknown }; payload?: Record<string, unknown> };
declare const chrome: {
  storage: { local: { get(key: string): Promise<Record<string, unknown>>; set(items: Record<string, unknown>): Promise<void> } };
  runtime: {
    sendMessage(msg: BluffMsg): Promise<unknown>;
    onMessage: { addListener(fn: (msg: BluffMsg, sender: { tab?: { id?: number } }, sendResponse: (r: unknown) => void) => boolean | void): void };
  };
  tabs: { sendMessage(tabId: number, msg: BluffMsg): Promise<unknown> };
};
declare const __BLUFF_APP__: string;
