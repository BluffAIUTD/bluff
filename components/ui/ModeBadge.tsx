import { Badge, type Tone } from "./Badge";

export type RunMode = "live" | "cached" | "replayed" | "basic" | "demo";

const META: Record<RunMode, { label: string; tone: Tone; hint: string }> = {
  live: { label: "LIVE", tone: "safe", hint: "Computed just now by the agent" },
  cached: { label: "CACHED", tone: "unsure", hint: "Reused from an earlier check of this host" },
  replayed: { label: "REPLAYED", tone: "unsure", hint: "Replay of the last successful run — not live" },
  basic: { label: "BASIC CHECK", tone: "neutral", hint: "Rules-only fallback; the AI check was unavailable" },
  demo: { label: "DEMO", tone: "accent", hint: "Synthetic demo data" },
};

export function ModeBadge({ mode }: { mode: RunMode }) {
  const m = META[mode];
  return <Badge tone={m.tone} title={m.hint}>{m.label}</Badge>;
}
