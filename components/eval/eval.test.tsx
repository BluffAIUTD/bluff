// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvalView } from "./EvalView";
import { compareF1 } from "./ClaimTable";
import type { EvalResults } from "@/lib/eval";

const prf = (f1: number) => ({ p: f1, r: f1, f1 });
const results = (over: Partial<EvalResults> = {}): EvalResults => ({
  generated_at: "2026-11-08T07:00:00Z",
  claimA: { n: 20, split: "seed 42, 80/20", dataset: "synthetic stand-in, not T-Mobile data", mode: "mock", bluff: prf(0.8), baseline: prf(0.7), baseline_name: "Keyword baseline", failures: [{ id: "a1", text: "msg", expected: "scam", predicted: "legit", note: "n1" }] },
  claimB: { n: 20, split: "test split", dataset: "seeded synthetic charges", method: "SQL linker", bluff: prf(0.9), baseline: prf(0.5), threshold: 0.55, failures: [] },
  ...over,
});

describe("compareF1 is honest", () => {
  it("win / tie / loss / no baseline", () => {
    expect(compareF1(0.8, 0.7)?.text).toBe("Beats the baseline by 10.0 F1 pts");
    expect(compareF1(0.7, 0.7)?.tone).toBe("unsure");
    expect(compareF1(0.6, 0.7)).toMatchObject({ tone: "scam", text: "Below the baseline by 10.0 F1 pts" });
    expect(compareF1(0.6, null)).toBeUndefined();
  });
});

describe("EvalView", () => {
  it("empty state when nothing is committed", () => {
    render(<EvalView results={null} />);
    expect(screen.getByText("No evaluation has been run yet")).toBeInTheDocument();
  });
  it("renders both claim tables with n, P/R/F1, baseline, failures, timestamp and the stand-in warning", () => {
    render(<EvalView results={results()} />);
    expect(screen.getAllByRole("table")).toHaveLength(2);
    expect(screen.getByText("Keyword baseline")).toBeInTheDocument();
    expect(screen.getByText("Naive substring match")).toBeInTheDocument();
    expect(screen.getAllByText("90.0%").length).toBeGreaterThan(0);
    expect(screen.getByText(/not a result on T-Mobile/)).toBeInTheDocument();
    expect(screen.getByText(/Results generated/)).toBeInTheDocument();
    expect(screen.getByText("Where Bluff is still wrong (Claim A)")).toBeInTheDocument();
    expect(screen.getByText("No failures in this run.")).toBeInTheDocument();
  });
  it("a baseline that is not available is shown as such; a losing result is not dressed up", () => {
    const r = results();
    r.claimA!.baseline = null;
    r.claimB!.bluff = prf(0.4);
    render(<EvalView results={r} />);
    expect(screen.getByText("Not available")).toBeInTheDocument();
    expect(screen.getByText(/Below the baseline by 10.0/)).toBeInTheDocument();
  });
  it("shows the caveat and the baseline's failures when present", () => {
    const r = results();
    r.claimB!.caveat = "Optimistic by construction.";
    r.claimB!.baseline_failures = [{ id: "p01", text: "FKSHP*LLC", expected: "fastkicks-shop", predicted: "no link", note: "missed the true exposure" }];
    render(<EvalView results={r} />);
    expect(screen.getByText("Optimistic by construction.")).toBeInTheDocument();
    expect(screen.getByText("Where the naive baseline fails (Claim B)")).toBeInTheDocument();
    expect(screen.getByText("FKSHP*LLC")).toBeInTheDocument();
  });
  it("a missing claim shows 'not run yet'", () => {
    render(<EvalView results={results({ claimB: null })} />);
    expect(screen.getByText("Claim B not run yet")).toBeInTheDocument();
  });
});
