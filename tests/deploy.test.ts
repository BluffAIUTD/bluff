import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { STORES } from "../data/stores";
// @ts-expect-error plain ESM script without types
import { caddyfile, STORE_SLUGS } from "../scripts/deploy/gen-caddyfile.mjs";

describe("deploy config", () => {
  it("committed Caddyfile is up to date and covers every demo store plus the app host", () => {
    expect(fs.readFileSync("deploy/Caddyfile", "utf8")).toBe(caddyfile());
    expect([...STORE_SLUGS].sort()).toEqual(STORES.map((s) => s.slug).sort());
    const f = caddyfile() as string;
    expect(f).toContain("bluff.{$BASE_DOMAIN}");
    expect(f).toContain("flush_interval -1"); // SSE must not be buffered
    for (const s of STORES) expect(f).toContain(`root * /srv/stores/${s.slug}`);
  });
  it("Dockerfile copies the runtime files read from disk, runs as non-root and has a healthcheck", () => {
    const d = fs.readFileSync("Dockerfile", "utf8");
    for (const p of ["fixtures", "stores", "db", "eval/results.json"]) expect(d).toContain(p);
    expect(d).toMatch(/USER bluff/);
    expect(d).toMatch(/HEALTHCHECK[\s\S]*api\/health/);
  });
  it(".env.example documents every variable the config reads and holds no secrets", () => {
    const env = fs.readFileSync(".env.example", "utf8");
    for (const k of ["AGENT_MODE", "DATABASE_URL", "POSTGRES_PASSWORD", "NVIDIA_API_KEY", "NEMOTRON_MODEL", "NESSIE_API_KEY", "SESSION_SECRET", "DEMO_KEY", "EVAL_KEY", "BASE_DOMAIN", "ACME_EMAIL"]) expect(env).toContain(`${k}=`);
    expect(env).not.toMatch(/nvapi-|sk-[A-Za-z0-9]{10,}/);
    for (const line of env.split("\n")) { const m = /^(NVIDIA_API_KEY|NESSIE_API_KEY)=(.*)$/.exec(line); if (m) expect(m[2].trim()).toBe(""); }
  });
});
