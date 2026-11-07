import type { Db } from "../../db";

export type ToolContext = { userId: string; db: Db; now?: Date; txnTs?: Date; baseDomain?: string };

export type ToolDef = {
  name: string;
  description: string;
  /** JSON schema for OpenAI-compatible tool calling. */
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
};

/** Every tool result is capped at 1 KB (engineering_spec §6.1). */
export function capJson(value: unknown, max = 1024): unknown {
  const s = JSON.stringify(value);
  if (s.length <= max) return value;
  if (Array.isArray(value)) {
    const arr = [...value];
    while (arr.length > 1 && JSON.stringify(arr).length > max) arr.pop();
    return arr;
  }
  if (value && typeof value === "object") {
    const o = { ...(value as Record<string, unknown>) };
    for (const k of Object.keys(o).reverse()) {
      if (JSON.stringify(o).length <= max) break;
      if (Array.isArray(o[k])) o[k] = (o[k] as unknown[]).slice(0, 5);
      if (JSON.stringify(o).length > max && typeof o[k] === "string") o[k] = (o[k] as string).slice(0, 80);
    }
    if (JSON.stringify(o).length <= max) return o;
  }
  return { truncated: true, preview: s.slice(0, max - 40) };
}

export const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.slice(0, max) : "");
