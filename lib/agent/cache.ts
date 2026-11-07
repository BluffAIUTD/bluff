import type { Db } from "../db";
import { many, one } from "../db";
import type { StepEvent, Verdict } from "../schemas";
import { loadFixture } from "./mock";

const DAY = 86_400_000;

/** A page verdict from a *live* agent run in the last 24 h can be reused ("checked earlier"). Mock/basic results never are. */
export async function findReusablePageVerdict(db: Db, userId: string, host: string, now = new Date()): Promise<{ verdict: Verdict; ageMinutes: number } | null> {
  const r = await one<{ payload: Verdict; created_at: Date }>(
    db,
    `SELECT payload, created_at FROM verdicts
      WHERE user_id=$1 AND subject_type='page' AND subject_id=$2 AND mode='live' AND created_at > $3
      ORDER BY created_at DESC LIMIT 1`,
    [userId, host, new Date(now.getTime() - DAY)],
  );
  if (!r) return null;
  return { verdict: { ...r.payload, mode: "cached" }, ageMinutes: Math.max(0, Math.round((now.getTime() - r.created_at.getTime()) / 60_000)) };
}

/** Persist the trace of a successful LIVE run of a scripted charge (survives demo reset). */
export async function saveReplayTrace(db: Db, scriptId: string, steps: Omit<StepEvent, "seq">[], verdict: Verdict) {
  if (verdict.mode !== "live") return;
  await db.query(
    `INSERT INTO replay_traces (script_id, steps, verdict) VALUES ($1,$2,$3)
     ON CONFLICT (script_id) DO UPDATE SET steps=EXCLUDED.steps, verdict=EXCLUDED.verdict, created_at=now()`,
    [scriptId, JSON.stringify(steps), JSON.stringify(verdict)],
  );
}

export type Replay = { steps: Omit<StepEvent, "seq">[]; verdict: Verdict; replayOf: string | null; source: "run" | "fixture" };

/**
 * Last successful trace for a charge (signature-moment fallback, demo_design §9). Prefers the last live run for the same
 * charge, then the committed fixture of its script id. Always labeled `replayed`; never presented as live.
 */
export async function findReplay(db: Db, userId: string, txnId: string, scriptId: string | null): Promise<Replay | null> {
  const run = await one<{ id: string; verdict_id: string | null }>(
    db,
    `SELECT id, verdict_id FROM agent_runs WHERE user_id=$1 AND trigger='txn' AND subject_id=$2 AND status='ok' AND mode='live'
      ORDER BY started_at DESC LIMIT 1`,
    [userId, txnId],
  );
  if (run?.verdict_id) {
    const v = await one<{ payload: Verdict }>(db, "SELECT payload FROM verdicts WHERE id=$1", [run.verdict_id]);
    const st = await many<{ kind: StepEvent["kind"]; tool: string | null; input_summary: string; output_summary: string; ms: number }>(
      db, "SELECT kind, tool, input_summary, output_summary, ms FROM agent_steps WHERE run_id=$1 ORDER BY seq", [run.id],
    );
    if (v && st.length) {
      return { verdict: { ...v.payload, mode: "replayed" }, replayOf: run.id, source: "run", steps: st.map((s) => ({ kind: s.kind, tool: s.tool, inputSummary: s.input_summary, outputSummary: s.output_summary, ms: s.ms })) };
    }
  }
  if (scriptId) {
    const saved = await one<{ steps: Omit<StepEvent, "seq">[]; verdict: Verdict }>(db, "SELECT steps, verdict FROM replay_traces WHERE script_id=$1", [scriptId]);
    if (saved) return { verdict: { ...saved.verdict, mode: "replayed" }, steps: saved.steps, replayOf: null, source: "run" };
  }
  const fx = scriptId ? loadFixture(scriptId) : null;
  if (fx) return { verdict: { ...fx.verdict, mode: "replayed" }, steps: fx.steps, replayOf: null, source: "fixture" };
  return null;
}
