import { getConfig } from "../config";

export type Sender = { send(phone: string, body: string): Promise<{ providerId: string }> };

/** Mock sender: pretends delivery succeeded. Set PHOTON_MOCK_FAIL=1 to exercise the failure path. */
export const mockSender: Sender = {
  async send() {
    if (process.env.PHOTON_MOCK_FAIL === "1") throw new Error("mock send failure");
    return { providerId: `mock_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  },
};

/** Live Photon sender is added in task 21; until then live mode without an adapter fails loudly (status "failed"). */
let live: Sender | null = null;
export function registerLiveSender(s: Sender) { live = s; }

export function getSender(): Sender {
  if (getConfig().photonMode === "live") {
    if (!live) throw new Error("PHOTON_MODE=live but no live sender is registered");
    return live;
  }
  return mockSender;
}

export const RETRY_DELAYS_MS = [1000, 4000, 10000];

/** Retry ×3 with backoff of 1 s, 4 s and 10 s (engineering_spec §6.3). */
export async function sendWithRetry(sender: Sender, phone: string, body: string, delays = RETRY_DELAYS_MS, sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<{ providerId: string; attempts: number }> {
  let lastErr: unknown;
  for (let i = 0; i <= delays.length; i++) {
    try {
      const r = await sender.send(phone, body);
      return { ...r, attempts: i + 1 };
    } catch (e) {
      lastErr = e;
      if (i < delays.length) await sleep(delays[i]);
    }
  }
  throw lastErr;
}
