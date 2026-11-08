import { domainIntelTool } from "./domainIntel";
import { draftDisputeTool } from "./draftDispute";
import { exposureLookupTool } from "./exposureLookup";
import { notifyTool } from "./notifyTool";
import { pageSignalsTool } from "./pageSignals";
import { fetchPageTool, readPageTool, siteOverviewTool } from "./siteTools";
import { submitVerdictTool } from "./submitVerdict";
import { taxonomyMatchTool } from "./taxonomyMatch";
import { txnSearchTool } from "./txnSearch";
import { capJson, type ToolContext, type ToolDef } from "./types";

/** Tool registry: the 8 tools of engineering_spec §6.1 plus the 3 deep-site-review tools of the bank scan. */
export const TOOLS: ToolDef[] = [domainIntelTool, pageSignalsTool, taxonomyMatchTool, exposureLookupTool, txnSearchTool, draftDisputeTool, notifyTool, submitVerdictTool, siteOverviewTool, readPageTool, fetchPageTool];

/** Tools offered per run kind (fewer tools → fewer wrong calls). */
const BY_KIND: Record<string, string[]> = {
  site: ["site_overview", "read_page", "fetch_page", "txn_search", "submit_verdict"],
};
const SITE_ONLY = new Set(["site_overview", "read_page", "fetch_page"]);

export function getTool(name: string): ToolDef | undefined { return TOOLS.find((t) => t.name === name); }

/** Run a tool by name; unknown tools and thrown errors become `{error}` results (the model sees them, the run continues). */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const t = getTool(name);
  if (!t) return { error: `unknown tool: ${name}` };
  try { return capJson(await t.run(args, ctx), t.maxBytes); } catch (e) { return { error: (e as Error).message.slice(0, 200) }; }
}

export const openAiTools = (kind?: string) => TOOLS.filter((t) => (kind && BY_KIND[kind] ? BY_KIND[kind].includes(t.name) : !SITE_ONLY.has(t.name))).map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
