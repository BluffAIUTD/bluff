import { getConfig } from "../config";
import { getPool, one } from "../db";
import { findCandidates, type LinkCandidate } from "../linker";
import type { StepEvent, Verdict } from "../schemas";
import { chat, LlmError, type ChatMessage } from "./llm";
import { basicVerdictFor } from "./mock";
import { MODE_PROMPTS, SYSTEM_PROMPT } from "./prompts";
import { getTool, openAiTools, runTool } from "./tools";
import { submitVerdict } from "./tools/submitVerdict";
import type { Emit, RunInput, RunOptions, RunResult, Runner } from "./types";

export const MAX_ITERATIONS = 6;
export const LIVE_DEADLINE_MS = 15_000;
/** A site run fetches a live website (<= 8 s) and RDAP on top of the model turns. */
export const SITE_DEADLINE_MS = 40_000;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function summarizeArgs(tool: string, a: Record<string, unknown>): string {
  const v = a.host ?? a.merchant ?? a.descriptor ?? a.descriptor_norm ?? a.text ?? a.txn_id ?? (tool === "submit_verdict" ? `score ${a.score}` : JSON.stringify(a));
  return clip(String(v), 70);
}

export function summarizeResult(tool: string, r: unknown): string {
  const o = r as Record<string, unknown> & { error?: string };
  if (o && typeof o === "object" && "error" in o && o.error) return clip(`error: ${o.error}`, 100);
  switch (tool) {
    case "domain_intel": return o.age_days == null ? "age unknown" : `${o.age_days} days old${o.brand_clone_of ? `, clones ${o.brand_clone_of}` : ""}${o.allowlisted ? ", allowlisted" : ""}`;
    case "page_signals": return o.analyzed ? `signals: ${Object.entries(o.signals as object).filter(([, v]) => v === true).map(([k]) => k).slice(0, 4).join(", ") || "none"}` : "limited check: page not analyzed";
    case "taxonomy_match": return Array.isArray(r) && r[0] ? `${r[0].category} ${r[0].score}` : "no match";
    case "exposure_lookup": return Array.isArray(r) ? (r.length ? `${r.length} match: ${r[0].host}, ${r[0].match_score}` : "no matching exposure") : "no result";
    case "txn_search": return `${o.count} prior charges, avg $${((Number(o.avg_cents) || 0) / 100).toFixed(2)}`;
    case "resolve_website": return o.host ? `${o.host} (${o.how})` : "no website found";
    case "scrape_site": return o.fetched ? clip(`${o.status} ${o.title || "(no title)"}${o.bot_blocked ? ", bot-blocked" : ""}${o.redirected_offsite ? `, redirects to ${o.final_host}` : ""}${o.source === "demo_store" ? " [demo store]" : ""}`, 100) : clip(`failed: ${o.error}`, 100);
    default: return clip(JSON.stringify(r), 100);
  }
}

async function subjectMessage(input: RunInput): Promise<{ text: string; candidates: LinkCandidate[]; txnTs?: Date; txn?: { descriptor: string } }> {
  if (input.kind === "page") {
    return { text: JSON.stringify({ subject: "page", url: input.url, host: input.host, field_types: input.fieldTypes, signals: input.signals, source: input.source }), candidates: [] };
  }
  if (input.kind === "message") return { text: JSON.stringify({ subject: "message", text: input.text.slice(0, 2000) }), candidates: [] };
  if (input.kind === "site") {
    const t = await one<{ ts: Date; amount_cents: number; mcc_category: string | null; source: string }>(getPool(), "SELECT ts, amount_cents, mcc_category, source FROM transactions WHERE id=$1 AND user_id=$2", [input.txnId, input.userId]);
    return {
      text: JSON.stringify({ subject: "merchant_site", bank: t?.source === "nessie" ? "Capital One (Nessie)" : "card", merchant: input.merchant, descriptor: input.descriptor, website: input.host, amount: t ? t.amount_cents / 100 : null, posted_at: t?.ts.toISOString().slice(0, 10), merchant_category: t?.mcc_category }),
      candidates: [], txnTs: t?.ts, txn: { descriptor: input.descriptor },
    };
  }
  const db = getPool();
  const t = await one<{ ts: Date; descriptor: string; descriptor_norm: string; amount_cents: number }>(db, "SELECT ts, descriptor, descriptor_norm, amount_cents FROM transactions WHERE id=$1 AND user_id=$2", [input.txnId, input.userId]);
  if (!t) throw new Error("transaction not found");
  const lr = await findCandidates(db, input.userId, { ts: t.ts, descriptor: t.descriptor, descriptorNorm: t.descriptor_norm });
  return {
    text: JSON.stringify({ subject: "charge", descriptor: t.descriptor, amount: t.amount_cents / 100, posted_at: t.ts.toISOString(), candidates: lr.candidates.map((c) => ({ exposure_id: c.exposureId, host: c.host, date: c.exposureAt.slice(0, 10), site_score: c.exposureScore, match_score: c.matchScore, reasons: c.reasons })) }),
    candidates: lr.candidates, txnTs: t.ts, txn: { descriptor: t.descriptor },
  };
}

/** The agent may only link to exposures it was actually given (never invented). Rejecting a strong (≥ .75) candidate downgrades it to "possible". */
export function reconcileLink(v: Verdict, candidates: LinkCandidate[], txnId?: string): Verdict {
  if (!txnId) return { ...v, linked: {} };
  const claimed = v.linked?.exposure_id;
  const hit = candidates.find((c) => c.exposureId === claimed);
  if (hit) return { ...v, linked: { exposure_id: hit.exposureId, txn_id: txnId, match_reasons: hit.reasons, kind: hit.kind } };
  const top = candidates[0];
  if (top && top.matchScore >= 0.75) return { ...v, linked: { exposure_id: top.exposureId, txn_id: txnId, match_reasons: top.reasons, kind: "possible" } };
  return { ...v, linked: { txn_id: txnId } };
}

/** Real Nemotron tool-calling loop (≤ 6 iterations, 15 s deadline, one repair turn, rules-only fallback). */
export const liveRun: Runner = async (input: RunInput, emit: Emit, opts: RunOptions = {}): Promise<RunResult> => {
  const cfg = getConfig();
  const t0 = Date.now();
  const deadline = AbortSignal.timeout(Number(process.env.AGENT_DEADLINE_MS) || (input.kind === "site" ? SITE_DEADLINE_MS : LIVE_DEADLINE_MS));
  const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
  let seq = 0;
  const step = (s: Omit<StepEvent, "seq">) => emit({ type: "step", data: { seq: seq++, ...s } });

  const fallback = (code: "timeout" | "malformed" | "rate_limited" | "upstream_down", message: string): RunResult => {
    const v = basicVerdictFor(input);
    console.warn(`[agent] ${input.kind} run fell back (${code}): ${message}`);
    emit({ type: "error", data: { code, message, fallbackVerdict: v } });
    return { verdict: v, mode: "basic", error: { code, message } };
  };

  if (opts.fail) return fallback(opts.fail === "ratelimit" ? "rate_limited" : opts.fail, "Forced failure (?fail=)");

  try {
    const subj = await subjectMessage(input);
    const messages: ChatMessage[] = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${MODE_PROMPTS[input.kind]}` },
      { role: "user", content: subj.text },
    ];
    const ctx = { userId: input.userId, db: getPool(), txnTs: subj.txnTs, ...(input.kind === "site" ? { site: { host: input.host, merchant: input.merchant, descriptor: input.descriptor } } : {}) };
    // A site run whose statement already names the website skips the lookup tool.
    const tools = openAiTools(input.kind).filter((t) => !(input.kind === "site" && input.host && t.function.name === "resolve_website"));
    let repaired = false;
    let nudged = false;
    step({ kind: "plan", tool: null, inputSummary: clip(input.kind === "page" ? `Check ${input.host}` : input.kind === "txn" ? `Charge ${subj.txn?.descriptor}` : input.kind === "site" ? `${input.merchant} · ${input.host ?? "website unknown"}` : `Message, ${input.text.length} chars`, 70), outputSummary: input.kind === "site" ? `Plan: ${input.host ? "" : "find website → "}scrape site → domain age → payment history → verdict` : `Plan: ${MODE_PROMPTS[input.kind].split("Expected tools: ")[1]?.replace(/\.$/, "") ?? "investigate"}`, ms: Date.now() - t0 });

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const msg = await chat({ model: cfg.nvidia.model, messages, tools, signal });
      if (!msg.tool_calls.length) {
        if (nudged) return fallback("malformed", "Model did not call submit_verdict");
        nudged = true;
        messages.push({ role: "assistant", content: msg.content ?? "" }, { role: "user", content: "Call submit_verdict now with your final verdict." });
        continue;
      }
      messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        const name = call.function.name;
        let args: Record<string, unknown> = {};
        let parseErr: string | null = null;
        try { args = JSON.parse(call.function.arguments || "{}"); } catch { parseErr = "arguments were not valid JSON"; }
        const tt = Date.now();

        if (name === "submit_verdict") {
          const res = parseErr ? { ok: false as const, errors: [parseErr] } : submitVerdict(args, "live");
          if (res.ok) {
            const v = reconcileLink(res.verdict, subj.candidates, input.kind === "txn" ? input.txnId : undefined);
            step({ kind: "final", tool: "submit_verdict", inputSummary: `score ${v.score}`, outputSummary: `${v.verdict} (${Math.round(v.confidence * 100)}% sure)`, ms: Date.now() - tt });
            emit({ type: "verdict", data: v });
            return { verdict: v, mode: "live" };
          }
          if (repaired) return fallback("malformed", "Model verdict failed validation twice");
          repaired = true;
          messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: `Your verdict failed validation: ${res.errors.join("; ")}. Call submit_verdict again.` }) });
          step({ kind: "tool", tool: "submit_verdict", inputSummary: "repair requested", outputSummary: clip(res.errors.join("; "), 100), ms: Date.now() - tt });
          continue;
        }

        const result = parseErr || !getTool(name) ? { error: parseErr ?? `unknown tool: ${name}` } : await runTool(name, args, ctx);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
        step({ kind: "tool", tool: name, inputSummary: summarizeArgs(name, args), outputSummary: summarizeResult(name, result), ms: Date.now() - tt });
      }
    }
    return fallback("malformed", "Model did not finish within the iteration limit");
  } catch (e) {
    if (e instanceof LlmError) return fallback(e.kind === "rate_limited" ? "rate_limited" : e.kind, e.message);
    if (deadline.aborted) return fallback("timeout", "The AI check took too long.");
    console.error("[agent] live run failed", (e as Error).message);
    return fallback("upstream_down", "AI check unavailable.");
  }
};
