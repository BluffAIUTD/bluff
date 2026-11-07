import type { RunModeValue, RunStreamEvent, StepEvent, Verdict } from "../schemas";

export type RunState = {
  steps: StepEvent[];
  verdict: Verdict | null;
  error: { code: string; message: string } | null;
  done: boolean;
  mode: RunModeValue | null;
  verdictId: string | null;
  totalMs: number | null;
};

export const initialRunState: RunState = { steps: [], verdict: null, error: null, done: false, mode: null, verdictId: null, totalMs: null };

/** Pure reducer: steps are de-duplicated by seq (the server replays everything to late/reconnecting subscribers). */
export function runReducer(s: RunState, e: RunStreamEvent | { type: "reset" } | { type: "client_error"; data: { code: string; message: string } }): RunState {
  switch (e.type) {
    case "reset": return initialRunState;
    case "step": {
      if (s.steps.some((x) => x.seq === e.data.seq)) return s;
      return { ...s, steps: [...s.steps, e.data].sort((a, b) => a.seq - b.seq) };
    }
    case "verdict": return { ...s, verdict: e.data };
    case "error": return { ...s, error: { code: e.data.code, message: e.data.message }, verdict: s.verdict ?? e.data.fallbackVerdict ?? null };
    case "client_error": return s.done ? s : { ...s, error: e.data, done: true };
    case "done": return { ...s, done: true, mode: e.data.mode, verdictId: e.data.verdictId ?? s.verdictId, totalMs: e.data.totalMs };
  }
}
