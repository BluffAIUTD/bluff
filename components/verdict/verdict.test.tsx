// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScoreDial } from "./ScoreDial";
import { VerdictCard } from "./VerdictCard";
import { AgentTrace } from "./AgentTrace";
import { toneFor } from "./tone";
import type { StepEvent, Verdict } from "@/lib/schemas";

const v = (over: Partial<Verdict> = {}): Verdict => ({
  score: 18, verdict: "likely_scam", confidence: 0.93, confidence_reason: "Six independent signals point the same way", category: "fake_store",
  evidence: ["Site is 4 days old", "Only takes gift cards", "Copies a brand"], evidence_keys: [], next_steps: ["Leave", "Shop elsewhere"], linked: {}, mode: "cached", ...over,
});

describe("ScoreDial", () => {
  it("exposes the final score to assistive tech regardless of animation", () => {
    render(<ScoreDial score={18} animate={false} />);
    expect(screen.getByRole("img", { name: "Trust score 18 out of 100" })).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });
  it("clamps out-of-range scores", () => {
    render(<ScoreDial score={140} animate={false} />);
    expect(screen.getByRole("img", { name: /100 out of 100/ })).toBeInTheDocument();
  });
  it("tone boundaries", () => {
    expect(toneFor(39).label).toBe("likely_scam"); expect(toneFor(40).label).toBe("unsure"); expect(toneFor(69).label).toBe("unsure"); expect(toneFor(70).label).toBe("looks_ok");
  });
});

describe("VerdictCard", () => {
  it("scam verdict: label, mode badge, evidence, confidence with reason, 'Do this instead'", () => {
    render(<VerdictCard verdict={v()} actions={<button>Leave</button>} />);
    expect(screen.getByRole("heading", { name: "Likely scam" })).toBeInTheDocument();
    expect(screen.getByText("CACHED")).toBeInTheDocument();
    expect(screen.getByText("93% sure")).toBeInTheDocument();
    expect(screen.getByText("Six independent signals point the same way")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText("Do this instead")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave" })).toBeInTheDocument();
  });
  it("low confidence is shown as Unsure with 'What to check yourself' (no red/green)", () => {
    render(<VerdictCard verdict={v({ confidence: 0.4, verdict: "unsure", score: 50, confidence_reason: "Only 1 signal" })} />);
    expect(screen.getByRole("heading", { name: "Unsure" })).toBeInTheDocument();
    expect(screen.getByText("What to check yourself")).toBeInTheDocument();
    expect(screen.getByLabelText("Verdict").className).not.toMatch(/scam|safe/);
  });
  it("forces Unsure presentation when confidence < 0.5 even if the payload says scam", () => {
    render(<VerdictCard verdict={v({ confidence: 0.3 })} />);
    expect(screen.getByRole("heading", { name: "Unsure" })).toBeInTheDocument();
  });
  it("basic and replayed modes are labeled; checked-earlier note", () => {
    render(<VerdictCard verdict={v({ mode: "basic" })} checkedEarlier />);
    expect(screen.getByText("BASIC CHECK")).toBeInTheDocument();
    expect(screen.getByText("checked earlier")).toBeInTheDocument();
  });
  it("looks_ok uses 'Good practice'", () => {
    render(<VerdictCard verdict={v({ score: 90, verdict: "looks_ok" })} />);
    expect(screen.getByText("Good practice")).toBeInTheDocument();
  });
});

describe("AgentTrace", () => {
  const steps: StepEvent[] = [
    { seq: 0, kind: "plan", tool: null, inputSummary: "Check fastkicks-shop", outputSummary: "Plan: domain → signals", ms: 310 },
    { seq: 1, kind: "tool", tool: "domain_intel", inputSummary: "fastkicks-shop", outputSummary: "4 days old", ms: 1420 },
  ];
  it("shows each step's tool, input, result and ms, then 'Verdict ready' with total time", () => {
    render(<AgentTrace steps={steps} running={false} totalMs={6200} />);
    expect(screen.getByText("domain_intel")).toBeInTheDocument();
    expect(screen.getByText("→ 4 days old")).toBeInTheDocument();
    expect(screen.getByText("1.4 s")).toBeInTheDocument();
    expect(screen.getByText("310 ms")).toBeInTheDocument();
    expect(screen.getByText(/Verdict ready · 6\.2 s/)).toBeInTheDocument();
  });
  it("running: starting, thinking, and the slow hint", () => {
    const { rerender } = render(<AgentTrace steps={[]} running />);
    expect(screen.getByText("Starting…")).toBeInTheDocument();
    rerender(<AgentTrace steps={steps} running slow />);
    expect(screen.getByText("Thinking…")).toBeInTheDocument();
    expect(screen.getByText("Taking longer than usual")).toBeInTheDocument();
    expect(screen.queryByText(/Verdict ready/)).toBeNull();
  });
});
