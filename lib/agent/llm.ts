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

/** OpenAI-compatible chat completion (build.nvidia.com NIM). Maps failures to LlmError kinds. */
export async function chat(a: ChatArgs): Promise<{ content: string | null; tool_calls: ToolCall[] }> {
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
  if (res.status === 429) throw new LlmError("rate_limited", "model rate limited");
  if (!res.ok) throw new LlmError("upstream_down", `model returned ${res.status}`);
  let j: { choices?: { message?: { content?: string | null; tool_calls?: ToolCall[] } }[] };
  try { j = await res.json(); } catch { throw new LlmError("malformed", "model returned non-JSON"); }
  const m = j.choices?.[0]?.message;
  if (!m) throw new LlmError("malformed", "model returned no message");
  return { content: m.content ?? null, tool_calls: m.tool_calls ?? [] };
}
