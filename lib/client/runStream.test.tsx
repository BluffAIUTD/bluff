// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, renderHook, screen } from "@testing-library/react";
import { initialRunState, runReducer } from "./runState";
import { useRunStream } from "./useRunStream";
import { RunView } from "../../components/verdict/RunView";
import type { Verdict } from "../schemas";

const verdict: Verdict = { score: 18, verdict: "likely_scam", confidence: 0.9, confidence_reason: "agree", category: "fake_store", evidence: ["a", "b", "c"], evidence_keys: [], next_steps: ["x", "y"], linked: {}, mode: "cached" };
const step = (seq: number) => ({ seq, kind: "tool" as const, tool: "domain_intel", inputSummary: "h", outputSummary: "o", ms: 5 });

class FakeES {
  static instances: FakeES[] = [];
  static CLOSED = 2;
  readyState = 1; closed = false;
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  constructor(public url: string) { FakeES.instances.push(this); }
  addEventListener(t: string, fn: (e: unknown) => void) { (this.listeners[t] ??= []).push(fn); }
  close() { this.closed = true; this.readyState = 2; }
  emit(t: string, data?: unknown) { for (const fn of this.listeners[t] ?? []) fn(data === undefined ? new Event(t) : ({ data: JSON.stringify(data) } as MessageEvent)); }
}

beforeEach(() => { FakeES.instances = []; vi.stubGlobal("EventSource", FakeES); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("runReducer", () => {
  it("de-duplicates replayed steps and keeps them ordered", () => {
    let s = initialRunState;
    for (const q of [1, 0, 1, 2, 0]) s = runReducer(s, { type: "step", data: step(q) });
    expect(s.steps.map((x) => x.seq)).toEqual([0, 1, 2]);
  });
  it("error with fallback sets the verdict; done records mode/verdictId/total; client_error ignored after done", () => {
    let s = runReducer(initialRunState, { type: "error", data: { code: "timeout", message: "slow", fallbackVerdict: { ...verdict, mode: "basic" } } });
    expect(s.verdict?.mode).toBe("basic");
    s = runReducer(s, { type: "done", data: { totalMs: 1200, mode: "basic", verdictId: "v1" } });
    expect(s).toMatchObject({ done: true, mode: "basic", verdictId: "v1", totalMs: 1200 });
    expect(runReducer(s, { type: "client_error", data: { code: "x", message: "y" } })).toBe(s);
  });
});

describe("useRunStream", () => {
  it("streams steps → verdict → done and closes the connection", () => {
    const { result } = renderHook(() => useRunStream("run-1"));
    const es = FakeES.instances[0];
    expect(es.url).toBe("/api/runs/run-1/stream");
    expect(result.current.running).toBe(true);
    act(() => { es.emit("step", step(0)); es.emit("step", step(0)); es.emit("step", step(1)); });
    expect(result.current.steps).toHaveLength(2);
    act(() => { es.emit("verdict", verdict); es.emit("done", { totalMs: 5000, mode: "cached", verdictId: "v9" }); });
    expect(result.current).toMatchObject({ done: true, running: false, verdictId: "v9", mode: "cached" });
    expect(es.closed).toBe(true);
  });

  it("null runId opens nothing; changing runId resets state and closes the old stream", () => {
    const { result, rerender } = renderHook(({ id }) => useRunStream(id), { initialProps: { id: null as string | null } });
    expect(FakeES.instances).toHaveLength(0);
    expect(result.current.running).toBe(false);
    rerender({ id: "a" });
    act(() => FakeES.instances[0].emit("step", step(0)));
    rerender({ id: "b" });
    expect(FakeES.instances[0].closed).toBe(true);
    expect(result.current.steps).toEqual([]);
  });

  it("flags slow after 12 s and gives up with a timeout error after 40 s", () => {
    const { result } = renderHook(() => useRunStream("slow"));
    act(() => { vi.advanceTimersByTime(12_100); });
    expect(result.current.slow).toBe(true);
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(result.current.error?.code).toBe("timeout");
    expect(result.current.done).toBe(true);
    expect(result.current.slow).toBe(false);
  });

  it("server error events (with payload) are surfaced; transport errors only fail when the connection is closed", () => {
    const { result } = renderHook(() => useRunStream("e"));
    const es = FakeES.instances[0];
    act(() => es.emit("error")); // transport blip while still connecting: ignored
    expect(result.current.error).toBeNull();
    es.readyState = 2;
    act(() => es.emit("error"));
    expect(result.current.error?.code).toBe("upstream_down");
  });
});

describe("RunView failure states", () => {
  it("fallback verdict shows the basic-check banner; no fallback shows an error with retry", () => {
    const retry = vi.fn();
    const { rerender } = render(<RunView runId="r" onRetry={retry} />);
    const es = FakeES.instances[0];
    act(() => { es.emit("error", { code: "malformed", message: "bad", fallbackVerdict: { ...verdict, mode: "basic" } }); es.emit("done", { totalMs: 900, mode: "basic" }); });
    expect(screen.getByRole("status")).toHaveTextContent("returned something unreadable");
    expect(screen.getByText("BASIC CHECK")).toBeInTheDocument();
    rerender(<RunView runId="r2" onRetry={retry} />);
    const es2 = FakeES.instances[1];
    act(() => { es2.emit("error", { code: "upstream_down", message: "down" }); es2.emit("done", { totalMs: 10, mode: "basic" }); });
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't finish this check");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("actions only appear once the run is done; cache step marks 'checked earlier'", () => {
    render(<RunView runId="r" actions={() => <button>Continue</button>} />);
    const es = FakeES.instances[0];
    act(() => { es.emit("step", { ...step(0), tool: "cache", outputSummary: "checked earlier (5 min ago)" }); es.emit("verdict", verdict); });
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    act(() => es.emit("done", { totalMs: 10, mode: "cached", verdictId: "v" }));
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.getByText("checked earlier")).toBeInTheDocument();
  });
});
