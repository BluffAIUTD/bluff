import { randomUUID } from "node:crypto";
import { getPool } from "../db";
import type { RunStreamEvent, StepEvent, Verdict } from "../schemas";
import { findReplay, findReusablePageVerdict } from "./cache";
import { afterRun } from "./hooks";
import { selectRunner } from "./index";
import { basicVerdictFor } from "./mock";
import { txnRulesVerdict } from "./txn";
import { subjectId, type FailureMode, type RunInput, type RunResult } from "./types";

type RunState = { events: RunStreamEvent[]; listeners: Set<(e: RunStreamEvent) => void>; done: boolean; touched: number };
const g = globalThis as unknown as { __bluffRuns?: Map<string, RunState> };
const runs = (g.__bluffRuns ??= new Map<string, RunState>());

export const HARD_TIMEOUT_MS = 15_000;
const RETAIN_MS = 5 * 60_000;

export type StartOptions = { fail?: FailureMode; /** bypass the 24 h verdict reuse */ fresh?: boolean };

function gc() {
  const now = Date.now();
  for (const [id, s] of runs) if (s.done && now - s.touched > RETAIN_MS) runs.delete(id);
}

function push(runId: string, e: RunStreamEvent) {
  const s = runs.get(runId);
  if (!s) return;
  s.events.push(e);
  s.touched = Date.now();
  for (const l of s.listeners) l(e);
  if (e.type === "done") s.done = true;
}

/** Start an agent run in the background. Returns immediately with the run id; the client opens the SSE stream next. */
export async function startRun(input: RunInput, opts: StartOptions = {}): Promise<{ runId: string }> {
  gc();
  const runId = randomUUID();
  runs.set(runId, { events: [], listeners: new Set(), done: false, touched: Date.now() });
  await getPool().query(
    "INSERT INTO agent_runs (id, user_id, trigger, subject_id, status) VALUES ($1,$2,$3,$4,'running')",
    [runId, input.userId, input.kind, subjectId(input)],
  );
  void execute(runId, input, opts);
  return { runId };
}

async function execute(runId: string, input: RunInput, opts: StartOptions) {
  const db = getPool();
  const t0 = Date.now();
  const writes: Promise<unknown>[] = [];
  let seq = 0;
  let replayOf: string | null = null;
  let heldError: Extract<RunStreamEvent, { type: "error" }> | null = null;

  const persistStep = (s: StepEvent) => {
    writes.push(
      db.query(
        `INSERT INTO agent_steps (run_id, seq, kind, tool, input_summary, output_summary, ms) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (run_id, seq) DO NOTHING`,
        [runId, s.seq, s.kind, s.tool ?? null, s.inputSummary, s.outputSummary, s.ms],
      ).catch((err) => console.error("[runs] step write failed", err.message)),
    );
  };

  const emit = (e: RunStreamEvent) => {
    if (e.type === "step") { seq = Math.max(seq, e.data.seq + 1); persistStep(e.data); }
    // `done` is emitted by us (after persistence) so it can carry the verdict id.
    if (e.type === "done") return;
    // A failed charge run is first offered a replay / rules verdict, so hold the error until we know.
    if (e.type === "error" && input.kind === "txn") { heldError = e; return; }
    push(runId, e);
  };
  const emitStep = (s: Omit<StepEvent, "seq">) => emit({ type: "step", data: { seq, ...s } });

  let result: RunResult | null = null;
  let errorHandled = false;

  // 1. 24 h reuse of a live page verdict ("checked earlier").
  if (input.kind === "page" && !opts.fail && !opts.fresh) {
    try {
      const hit = await findReusablePageVerdict(db, input.userId, input.host);
      if (hit) {
        emitStep({ kind: "tool", tool: "cache", inputSummary: input.host, outputSummary: `checked earlier (${hit.ageMinutes} min ago)`, ms: 2 });
        emit({ type: "verdict", data: hit.verdict });
        result = { verdict: hit.verdict, mode: "cached" };
      }
    } catch (e) { console.error("[runs] cache lookup failed", (e as Error).message); }
  }

  // 2. The agent.
  if (!result) {
    try {
      const runner = await selectRunner();
      let timer: NodeJS.Timeout | undefined;
      const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => r("timeout"), HARD_TIMEOUT_MS + (opts.fail === "timeout" ? 60_000 : 0)); });
      const raced = await Promise.race([runner(input, emit, { fail: opts.fail }), timeout]);
      clearTimeout(timer);
      if (raced === "timeout") {
        const fallback = basicVerdictFor(input);
        emit({ type: "error", data: { code: "timeout", message: "The AI check took too long.", fallbackVerdict: fallback } });
        result = { verdict: fallback, mode: "basic", error: { code: "timeout", message: "timeout" } };
      } else result = raced;
    } catch (e) {
      console.error("[runs] runner crashed", (e as Error).message);
      const fallback = basicVerdictFor(input);
      emit({ type: "error", data: { code: "upstream_down", message: "AI check unavailable.", fallbackVerdict: fallback } });
      result = { verdict: fallback, mode: "basic", error: { code: "upstream_down", message: (e as Error).message } };
    }
  }

  // 3. Charge failure ladder: replay last good trace (labeled) → rules-only verdict over real data.
  if (input.kind === "txn" && result.error && result.error.code !== "not_found") {
    try {
      const rules = await txnRulesVerdict(db, input.userId, input.txnId);
      const replay = await findReplay(db, input.userId, input.txnId, rules?.scriptId ?? null);
      if (replay) {
        emitStep({ kind: "plan", tool: null, inputSummary: "AI check unavailable", outputSummary: "Replaying the last successful run (not live)", ms: 0 });
        for (const s of replay.steps) emitStep(s);
        const v: Verdict = { ...replay.verdict, mode: "replayed", linked: rules?.verdict.linked ?? replay.verdict.linked };
        replayOf = replay.replayOf;
        emit({ type: "verdict", data: v });
        result = { verdict: v, mode: "replayed", error: result.error };
        errorHandled = true; // the replay replaces the error
      } else if (rules) {
        const he = heldError as Extract<RunStreamEvent, { type: "error" }> | null;
        push(runId, { type: "error", data: { code: he?.data.code ?? "upstream_down", message: he?.data.message ?? "AI check unavailable.", fallbackVerdict: rules.verdict } });
        result = { verdict: rules.verdict, mode: "basic", error: result.error };
        errorHandled = true;
      }
    } catch (e) { console.error("[runs] replay failed", (e as Error).message); }
  }
  if (heldError && !errorHandled) push(runId, heldError);

  let verdictId: string | undefined;
  try {
    await Promise.all(writes);
    const v = result.verdict;
    const vr = await db.query(
      "INSERT INTO verdicts (user_id, subject_type, subject_id, payload, mode) VALUES ($1,$2,$3,$4,$5) RETURNING id",
      [input.userId, input.kind, subjectId(input), JSON.stringify(v), v.mode],
    );
    verdictId = vr.rows[0].id;
    await db.query(
      "UPDATE agent_runs SET status=$2, ended_at=now(), total_ms=$3, verdict_id=$4, mode=$5, model=$6, replay_of=$7 WHERE id=$1",
      [runId, result.error && result.mode !== "replayed" ? "error" : "ok", Date.now() - t0, verdictId, result.mode, result.mode === "live" ? "nemotron" : "mock", replayOf],
    );
  } catch (e) {
    console.error("[runs] persistence failed", (e as Error).message);
  }
  await afterRun(db, input, result.verdict, verdictId).catch((e) => console.error("[runs] afterRun failed", (e as Error).message));
  push(runId, { type: "done", data: { totalMs: Date.now() - t0, mode: result.mode, verdictId, runId } });
}

/** Subscribe to a run's events. Replays everything seen so far (memory, else rebuilt from the DB). Returns an unsubscribe fn. */
export async function subscribe(runId: string, listener: (e: RunStreamEvent) => void): Promise<(() => void) | null> {
  const s = runs.get(runId);
  if (s) {
    for (const e of s.events) listener(e);
    if (s.done) return () => {};
    s.listeners.add(listener);
    return () => s.listeners.delete(listener);
  }
  const snap = await getRunSnapshot(runId);
  if (!snap) return null;
  for (const st of snap.steps) listener({ type: "step", data: st });
  if (snap.verdict) listener({ type: "verdict", data: snap.verdict });
  listener({ type: "done", data: { totalMs: snap.run.totalMs ?? 0, mode: (snap.run.mode ?? "basic") as never, verdictId: snap.run.verdictId ?? undefined, runId } });
  return () => {};
}

export type RunSnapshot = {
  run: { id: string; trigger: string; subjectId: string | null; status: string; mode: string | null; totalMs: number | null; verdictId: string | null; startedAt: string };
  steps: { seq: number; kind: "plan" | "tool" | "final"; tool: string | null; inputSummary: string; outputSummary: string; ms: number }[];
  verdict: Verdict | null;
};

export async function getRunSnapshot(runId: string): Promise<RunSnapshot | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const db = getPool();
  const r = (await db.query("SELECT * FROM agent_runs WHERE id=$1", [runId])).rows[0];
  if (!r) return null;
  const steps = (await db.query("SELECT seq, kind, tool, input_summary, output_summary, ms FROM agent_steps WHERE run_id=$1 ORDER BY seq", [runId])).rows;
  const v = r.verdict_id ? (await db.query("SELECT payload FROM verdicts WHERE id=$1", [r.verdict_id])).rows[0] : null;
  return {
    run: { id: r.id, trigger: r.trigger, subjectId: r.subject_id, status: r.status, mode: r.mode, totalMs: r.total_ms, verdictId: r.verdict_id, startedAt: r.started_at.toISOString() },
    steps: steps.map((s) => ({ seq: s.seq, kind: s.kind, tool: s.tool, inputSummary: s.input_summary, outputSummary: s.output_summary, ms: s.ms })),
    verdict: v ? v.payload : null,
  };
}

/** Run to completion and return the verdict (used by eval and SMS paths). */
export async function runToCompletion(input: RunInput, opts: StartOptions = {}): Promise<{ verdict: Verdict; verdictId?: string; mode: string; runId: string }> {
  const { runId } = await startRun(input, opts);
  return new Promise((resolve, reject) => {
    let verdict: Verdict | null = null;
    let unsub: (() => void) | null = null;
    void subscribe(runId, (e) => {
      if (e.type === "verdict") verdict = e.data;
      if (e.type === "error" && e.data.fallbackVerdict && !verdict) verdict = e.data.fallbackVerdict;
      if (e.type === "done") {
        unsub?.();
        if (!verdict) return reject(new Error("run finished without a verdict"));
        resolve({ verdict, verdictId: e.data.verdictId, mode: e.data.mode, runId });
      }
    }).then((u) => { unsub = u; });
  });
}
