import { getConfig, liveAgentAvailable } from "../config";
import { mockRun } from "./mock";
import type { Runner } from "./types";

/** Pick the runner for the current environment. Live falls back to mock (with a warning) when credentials are missing. */
export async function selectRunner(): Promise<Runner> {
  const c = getConfig();
  if (c.agentMode === "live") {
    if (!liveAgentAvailable(c)) {
      console.warn("[agent] AGENT_MODE=live but NVIDIA_API_KEY/NEMOTRON_MODEL missing; using mock runner");
      return mockRun;
    }
    const { liveRun } = await import("./live");
    return liveRun;
  }
  return mockRun;
}
