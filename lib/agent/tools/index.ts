import { domainIntelTool } from "./domainIntel";
import { draftDisputeTool } from "./draftDispute";
import { exposureLookupTool } from "./exposureLookup";
import { notifyTool } from "./notifyTool";
import { pageSignalsTool } from "./pageSignals";
import { fetchPageTool, readPageTool } from "./siteTools";
import { submitVerdictTool } from "./submitVerdict";
import { taxonomyMatchTool } from "./taxonomyMatch";
import { txnSearchTool } from "./txnSearch";
import { capJson, type ToolContext, type ToolDef } from "./types";

/** Tool registry: the 8 tools of engineering_spec §6.1 plus the 2 site-review tools (bank scan and crawled page checks). */
export const TOOLS: ToolDef[] = [domainIntelTool, pageSignalsTool, taxonomyMatchTool, exposureLookupTool, txnSearchTool, draftDisputeTool, notifyTool, submitVerdictTool, readPageTool, fetchPageTool];

/** Tools offered per run kind (fewer tools → fewer wrong calls). Kinds not listed get every non-site tool. */
export const BY_KIND: Record<string, string[]> = {
  /** A forwarded text or email: what kind of scam it resembles, who owns its links, then the verdict. */
  message: ["taxonomy_match", "domain_intel", "submit_verdict"],
  /** Bank scan deep review: the crawl's data is in the first message. */
  site: ["read_page", "fetch_page", "txn_search", "submit_verdict"],
  /** Page check of a site Bluff crawled (/check link, Checkout Guard): the crawl's data is in the first message. */
  page_site: ["read_page", "fetch_page", "submit_verdict"],
};
const SITE_ONLY = new Set(["read_page", "fetch_page"]);

export function getTool(name: string): ToolDef | undefined { return TOOLS.find((t) => t.name === name); }

/** Run a tool by name; unknown tools and thrown errors become `{error}` results (the model sees them, the run continues). */
export async function runTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<unknown> {
  const t = getTool(name);
  if (!t) return { error: `unknown tool: ${name}` };
  try { return capJson(await t.run(args, ctx), t.maxBytes); } catch (e) { return { error: (e as Error).message.slice(0, 200) }; }
}

export const openAiTools = (kind?: string) => TOOLS.filter((t) => (kind && BY_KIND[kind] ? BY_KIND[kind].includes(t.name) : !SITE_ONLY.has(t.name))).map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } }));
