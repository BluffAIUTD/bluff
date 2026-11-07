import { getConfig } from "../config";

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };

export class LlmError extends Error {
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

/** Counting semaphore: the hosted endpoint answers 429 when calls overlap, so model calls are throttled client-side. */
class Semaphore {
  private waiters: (() => void)[] = [];
  private active = 0;
  constructor(private max: () => number) {}
  async run<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    while (this.active >= this.max()) {
      await new Promise<void>((resolve, reject) => { this.waiters.push(resolve); signal?.addEventListener("abort", () => reject(new LlmError("timeout", "model request timed out")), { once: true }); });
    }
    this.active++;
    try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
}
const g = globalThis as unknown as { __llmSem?: Semaphore };
const sem = (g.__llmSem ??= new Semaphore(() => Math.max(1, Number(process.env.LLM_MAX_CONCURRENCY) || 2)));
const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((r) => { const t = setTimeout(r, ms); signal?.addEventListener("abort", () => { clearTimeout(t); r(); }, { once: true }); });

/** OpenAI-compatible chat completion (build.nvidia.com NIM). Maps failures to LlmError kinds. */
export async function chat(a: ChatArgs): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
  // Retry 429s with backoff (honoring Retry-After) before giving up; the caller's deadline still bounds the total time.
  const base = Number(process.env.LLM_RETRY_BASE_MS) || 700;
  for (let attempt = 0; ; attempt++) {
    try {
      return await sem.run(() => chatOnce(a), a.signal);
    } catch (e) {
      if (!(e instanceof LlmError) || e.kind !== "rate_limited" || attempt >= 3 || a.signal?.aborted) throw e;
      await sleep(Math.min(5000, base * 2 ** attempt), a.signal);
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
      }),
    });
  } catch (e) {
    if ((e as Error).name === "AbortError" || (e as Error).name === "TimeoutError") throw new LlmError("timeout", "model request timed out");
    throw new LlmError("upstream_down", `model unreachable: ${(e as Error).message}`);
  }
  if (res.status === 429) throw new LlmError("rate_limited", "model rate limited");
  if (!res.ok) throw new LlmError("upstream_down", `model returned ${res.status}`);
  let j: { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  try { j = await res.json(); } catch { throw new LlmError("malformed", "model returned non-JSON"); }
  const m = j.choices?.[0]?.message;
  if (!m) throw new LlmError("malformed", "model returned no message");
  return { content: m.content ?? null, tool_calls: m.tool_calls ?? [] };
}
