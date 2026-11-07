import type { Runner } from "./types";
import { mockRun } from "./mock";

/** Placeholder until task 14 lands the real Nemotron tool-calling loop. */
export const liveRun: Runner = (input, emit, opts) => mockRun(input, emit, opts);
