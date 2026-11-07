import { domainIntelTool } from "./domainIntel";
import { exposureLookupTool } from "./exposureLookup";
import { pageSignalsTool } from "./pageSignals";
import { submitVerdictTool } from "./submitVerdict";
import { taxonomyMatchTool } from "./taxonomyMatch";
import { txnSearchTool } from "./txnSearch";
import { capJson, type ToolContext, type ToolDef } from "./types";

/** Tool registry. draft_dispute (task 18) and notify (task 21) are appended when their modules land. */
export const TOOLS: ToolDef[] = [domainIntelTool, pageSignalsTool, taxonomyMatchTool, exposureLookupTool, txnSearchTool, submitVerdictTool];

export function getTool(name: string): ToolDef | undefined { return TOOLS.find((t) => t.name === name); }

/** Run a tool by name; unknown tools and thrown errors become `{error}` results (the model sees them, the run continues). */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const t = getTool(name);
  if (!t) return { error: `unknown tool: ${name}` };
  try { return capJson(await t.run(args, ctx)); } catch (e) { return { error: (e as Error).message.slice(0, 200) }; }
}

export const openAiTools = () => TOOLS.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
