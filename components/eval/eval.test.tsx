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

describe("EvalView: detailed Claim A (methods, calibration, per category, live sample)", () => {
  const cal = (ece: number) => ({ n: 10, ece, buckets: [{ range: "0.50–0.60", n: 0, stated: null, observed: null }, { range: "0.90–1.00", n: 10, stated: 0.93, observed: 0.9 }] });
  const method = (id: string, name: string, f1: number, extra = {}) => ({ id, name, mode: "basic", n: 91, prf: { p: f1, r: f1, f1, accuracy: f1 }, accuracy: f1, ...extra });
  const detailed = () => {
    const r = results();
    r.claimA = {
      ...r.claimA!, n: 91, bluff: prf(0.9), baseline: prf(0.58), headline: "rules",
      methods: [method("baseline", "Stand-in baseline: contains a link", 0.58), method("rules_v0", "Bluff rules-only, before", 0.69, { calibration: cal(0.167) }), method("rules", "Bluff rules-only, after", 0.9, { calibration: cal(0.066) }), method("live", "Bluff live agent, sample", 0.95, { mode: "live", n: 50, calibration: cal(0.05) })],
      per_category: [{ category: "toll_scam", label: "scam", n: 3, correct: { baseline: 3, rules_v0: 1, rules: 3 } }],
      no_link_subset: { n: 40, scam: 20, methods: { baseline: { p: 0, r: 0, f1: 0 }, rules: { p: 0.8, r: 0.8, f1: 0.8 } } },
      confidence_model: { floor: 0.35, cap: 0.95, tau: 0.18, formula: "floor + (cap − floor) · (1 − e^(−net/tau))", fitted_on: "train split" },
      live: { model: "nemotron-test", n: 50, full_test_split: false, sample: "stratified sample: 2 per category (seed 42)", from_model: 49, fell_back: 1, latency_ms: { p50: 4500, p95: 6500, max: 8000 } },
      other_failures: [{ id: "bm-1", text: "other miss", expected: "scam", predicted: "legit", note: "live" }],
    };
    return r;
  };
  it("lists every method with accuracy, highlights the headline, and still compares with the baseline", () => {
    render(<EvalView results={detailed()} />);
    expect(screen.getByText("Bluff rules-only, before")).toBeInTheDocument();
    expect(screen.getByText("Bluff rules-only, after").closest("tr")).toHaveClass("bg-accent/10");
    expect(screen.getByText(/Beats the baseline by 32.0 F1 pts/)).toBeInTheDocument();
    expect(screen.getAllByText("Accuracy").length).toBeGreaterThan(0);
  });
  it("shows calibration (stated → observed, ECE), per-category counts, the no-link subset and an honest live-sample note", () => {
    render(<EvalView results={detailed()} />);
    expect(screen.getByText("Honest confidence: stated vs. observed")).toBeInTheDocument();
    expect(screen.getByText("0.066")).toBeInTheDocument();
    expect(screen.getByText("0.167")).toBeInTheDocument();
    expect(screen.getByText("toll_scam")).toBeInTheDocument();
    expect(screen.getByText("1/3")).toBeInTheDocument();
    expect(screen.getByText(/Messages with no link \(n=40, 20 scams\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not the whole test split/)).toBeInTheDocument();
    expect(screen.getByText(/49 of 50 verdicts came from Nemotron; 1 fell back/)).toBeInTheDocument();
    expect(screen.getByText("other miss")).toBeInTheDocument();
  });
});

