import fs from "node:fs";
import path from "node:path";
import { StepEventSchema, VerdictSchema, type StepEvent, type Verdict } from "../schemas";
import { getConfig } from "../config";
import { basicCheck } from "../rules/basicCheck";
import { messageKeys, pageKeys, extractUrls } from "../rules/signals";
import type { Emit, RunInput, RunOptions, RunResult } from "./types";

type Fixture = { host: string; verdict: Verdict; steps: Omit<StepEvent, "seq">[] };

const DIR = path.join(process.cwd(), "fixtures", "runs");

export function loadFixture(key: string): Fixture | null {
  if (!/^[a-z0-9_-]+$/i.test(key)) return null; // never build paths from untrusted text
  const file = path.join(DIR, `${key}.json`);
  if (!fs.existsSync(file)) return null;
  const f = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;
  VerdictSchema.parse(f.verdict);
  f.steps.forEach((s) => StepEventSchema.omit({ seq: true }).parse(s));
  return f;
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(t); resolve(); }, { once: true });
  });

/** Realistic pacing (engineering_spec §4): first step at 400 ms, then 600–1,400 ms gaps. Scaled by MOCK_SPEED (0 = instant). */
export function paceFor(i: number, speed = getConfig().mockSpeed): number {
  if (speed <= 0) return 0;
  const base = i === 0 ? 400 : 600 + ((i * 337) % 800);
  return base * speed;
}

function stepsFromBasic(input: RunInput, v: Verdict): Omit<StepEvent, "seq">[] {
  if (input.kind === "message") {
    const urls = extractUrls(input.text);
    return [
      { kind: "plan", tool: null, inputSummary: `Message, ${input.text.length} chars`, outputSummary: "Plan: taxonomy → link check → verdict", ms: 280 },
      { kind: "tool", tool: "taxonomy_match", inputSummary: input.text.slice(0, 40), outputSummary: `${v.category}`, ms: 340 },
      ...(urls.length ? [{ kind: "tool" as const, tool: "domain_intel", inputSummary: urls[0].slice(0, 50), outputSummary: "age unknown (limited check)", ms: 290 }] : []),
      { kind: "final", tool: "submit_verdict", inputSummary: `score ${v.score}`, outputSummary: `${v.verdict} (${Math.round(v.confidence * 100)}% sure)`, ms: 100 },
    ];
  }
  const host = input.kind === "page" ? input.host : "charge";
  return [
    { kind: "plan", tool: null, inputSummary: `Check ${host}`, outputSummary: "Plan: domain → signals → verdict", ms: 260 },
    { kind: "tool", tool: "domain_intel", inputSummary: host, outputSummary: "age unknown", ms: 300 },
    { kind: "tool", tool: "page_signals", inputSummary: host, outputSummary: "limited check: page not analyzed", ms: 280 },
    { kind: "final", tool: "submit_verdict", inputSummary: `score ${v.score}`, outputSummary: `${v.verdict} (${Math.round(v.confidence * 100)}% sure)`, ms: 100 },
  ];
}

/** Fallback verdict for any input without calling a model. Always mode="basic". */
export function basicVerdictFor(input: RunInput): Verdict {
  if (input.kind === "message") return basicCheck({ keys: messageKeys(input.text) });
  if (input.kind === "page") {
    const s = input.signals as Record<string, boolean | number>;
    const tld = input.host.split(".").pop();
    return basicCheck({ keys: pageKeys(s, { ageDays: null, tld }) });
  }
  return basicCheck({ keys: [] });
}

/** Mock agent: replays committed fixtures (labeled "cached" — it is not a live model run) or the rules-only path. */
export async function mockRun(input: RunInput, emit: Emit, opts: RunOptions = {}): Promise<RunResult> {
  const t0 = Date.now();
  const key = input.kind === "page" ? input.host : input.kind === "txn" ? input.txnId : null;
  const fixture = key ? loadFixture(key) : null;
  const verdict = fixture ? fixture.verdict : basicVerdictFor(input);
  const steps = fixture ? fixture.steps : stepsFromBasic(input, verdict);

  let seq = 0;
  for (const s of steps) {
    await sleep(paceFor(seq), opts.signal);
    if (opts.signal?.aborted) return { verdict, mode: verdict.mode };
    emit({ type: "step", data: { seq, ...s } });
    seq++;
  }

  if (opts.fail) {
    const fallback = basicVerdictFor(input);
    const msg = { timeout: "The AI check took too long.", malformed: "The AI check returned an unreadable answer.", ratelimit: "The AI service is busy right now." }[opts.fail];
    if (opts.fail === "timeout") await sleep(getConfig().mockSpeed > 0 ? 12_500 * getConfig().mockSpeed : 0, opts.signal);
    emit({ type: "error", data: { code: opts.fail === "ratelimit" ? "rate_limited" : opts.fail, message: msg, fallbackVerdict: fallback } });
    emit({ type: "done", data: { totalMs: Date.now() - t0, mode: "basic" } });
    return { verdict: fallback, mode: "basic", error: { code: opts.fail, message: msg } };
  }

  emit({ type: "verdict", data: verdict });
  emit({ type: "done", data: { totalMs: Date.now() - t0, mode: verdict.mode } });
  return { verdict, mode: verdict.mode };
}
