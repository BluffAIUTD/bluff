import { getConfig } from "../config";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export class LlmError extends Error {
  retryAfterSec?: number;
  constructor(public kind: "rate_limited" | "upstream_down" | "timeout" | "malformed", message: string) { super(message); }
}

export type ChatArgs = {
  model: string;
  messages: ChatMessage[];
  tools?: unknown[];
  signal?: AbortSignal;
  temperature?: number;
  maxTokens?: number;
  fetchImpl?: typeof fetch;
};

const g = globalThis as unknown as { __nvPacer?: { next: number } };
const pacer = (g.__nvPacer ??= { next: 0 });
const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (ms <= 0) return resolve();
  const t = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => { clearTimeout(t); reject(Object.assign(new Error("aborted"), { name: "AbortError" })); }, { once: true });
});
/** All Nemotron calls in this process share one pacer (build.nvidia.com trial keys allow ~40 requests/minute). */
async function paced(signal?: AbortSignal) {
  const gap = Number(process.env.NVIDIA_MIN_GAP_MS ?? 1600);
  const now = Date.now();
  const slot = Math.max(now, pacer.next);
  pacer.next = slot + gap;
  await wait(slot - now, signal);
}

/** OpenAI-compatible chat completion (build.nvidia.com NIM), paced, with up to 3 retries on 429 (Retry-After honored). */
export async function chat(a: ChatArgs): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
  const retries = a.fetchImpl ? 0 : Number(process.env.NVIDIA_RETRIES ?? 3);
  for (let attempt = 0; ; attempt++) {
    try {
      if (!a.fetchImpl) await paced(a.signal);
      return await chatOnce(a);
    } catch (e) {
      if (!(e instanceof LlmError) || e.kind !== "rate_limited" || attempt >= retries) throw e;
      const ms = (e.retryAfterSec ?? 0) * 1000 || Number(process.env.NVIDIA_RETRY_BASE_MS ?? 2500) * 2 ** attempt;
      try { await wait(ms, a.signal); } catch { throw new LlmError("timeout", "model request timed out"); }
    }
  }
}

async function chatOnce(a: ChatArgs): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
  const c = getConfig().nvidia;
  const f = a.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await f(`${c.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      signal: a.signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${c.apiKey}` },
      body: JSON.stringify({
        model: a.model, messages: a.messages, temperature: a.temperature ?? 0.2, max_tokens: a.maxTokens ?? 1024,
        ...(a.tools ? { tools: a.tools, tool_choice: "auto" } : {}),
        // Nemotron 3.x hybrid-reasoning models: skip the reasoning trace for latency (NEMOTRON_THINKING=off).
        ...(c.thinking === "off" ? { chat_template_kwargs: { enable_thinking: false } } : {}),
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError" || (e as Error).name === "TimeoutError") throw new LlmError("timeout", "model request timed out");
    throw new LlmError("upstream_down", `model unreachable: ${(e as Error).message}`);
  }
  if (res.status === 429) throw Object.assign(new LlmError("rate_limited", "model rate limited"), { retryAfterSec: Number(res.headers.get("retry-after")) || undefined });
  if (!res.ok) throw new LlmError("upstream_down", `model returned ${res.status}`);
  let j: { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  try { j = await res.json(); } catch { throw new LlmError("malformed", "model returned non-JSON"); }
  const m = j.choices?.[0]?.message;
  if (!m) throw new LlmError("malformed", "model returned no message");
  return { content: m.content ?? null, tool_calls: m.tool_calls ?? [] };
}
