import { describe, it, expect } from "vitest";
import fs from "node:fs";
// @ts-expect-error plain ESM script without types
import { build } from "../scripts/demo-script.mjs";

describe("demo script generator", () => {
  const r = JSON.parse(fs.readFileSync("eval/results.json", "utf8"));
  it("fills real numbers and warns about stand-in data and the rules-only path", () => {
    const { lines, warnings } = build(r);
    expect(lines.join(" ")).toContain(`F1 ${r.claimA.bluff.f1.toFixed(2)}`);
    expect(warnings.join(" ")).toMatch(/STAND-IN/);
    expect(warnings.join(" ")).toMatch(/rules-only/);
  });
  it("warns when Bluff does not beat a baseline, and when results are missing", () => {
    const losing = structuredClone(r); losing.claimA.bluff.f1 = 0.5; losing.claimB.bluff.f1 = 0.4;
    expect(build(losing).warnings.join(" ")).toMatch(/did NOT beat the baseline/);
    expect(build(losing).warnings.join(" ")).toMatch(/linker did NOT beat/);
    expect(build(null).warnings[0]).toMatch(/missing/);
  });
});

describe("docs do not overclaim", () => {
  const readme = fs.readFileSync("README.md", "utf8");
  it("README states what is not verified", () => {
    for (const s of ["not run against Photon", "untested", "not deployed", "synthetic stand-in", "hit the 15 s deadline"]) expect(readme.toLowerCase()).toContain(s.toLowerCase());
  });
  it("no invented statistics or customer claims in the docs", () => {
    for (const f of ["README.md", "DEVPOST.md", "DEPLOY.md"]) {
      const t = fs.readFileSync(f, "utf8");
      expect(t, f).not.toMatch(/\b\d+(\.\d+)?\s?(million|billion)\b.*(lost|victims|reports)/i);
    }
    expect(fs.readFileSync("DEVPOST.md", "utf8")).toContain("No statistic is claimed");
  });
});
