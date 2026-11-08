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
    expect(f).toContain("flush_interval -1"); // SSE must not be buffered
    for (const s of STORES) expect(f).toContain(`root * /srv/stores/${s.slug}`);
  });
  it("the app is served at the apex only; bluff.<domain> 301-redirects there (one origin, one session cookie)", () => {
    const f = caddyfile() as string;
    const block = (site: string) => new RegExp(`^${site.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\{\\n([\\s\\S]*?)\\n\\}`, "m").exec(f)?.[1] ?? null;
    const app = block("{$BASE_DOMAIN}");
    expect(app).toMatch(/reverse_proxy web:3000 \{\s*flush_interval -1\s*\}/);
    expect(block("bluff.{$BASE_DOMAIN}")).toBe("\tredir https://{$BASE_DOMAIN}{uri} permanent");
    expect(f.match(/reverse_proxy/g)).toHaveLength(1);
    expect(f).not.toMatch(/\{\$BASE_DOMAIN\}\s*,/); // no combined "apex, bluff.apex" site block (the old hand edit)
  });
  it("Dockerfile copies the runtime files read from disk, runs as non-root and has a healthcheck", () => {
    const d = fs.readFileSync("Dockerfile", "utf8");
    for (const p of ["fixtures", "stores", "db", "eval/results.json", "extension/release"]) expect(d).toContain(p);
    expect(d).toMatch(/USER bluff/);
    expect(d).toMatch(/HEALTHCHECK[\s\S]*api\/health/);
  });
  it("the Chrome extension zip is built into the image for the deployment's address", () => {
    const d = fs.readFileSync("Dockerfile", "utf8");
    const build = d.slice(d.indexOf("AS build"), d.indexOf("AS tools"));
    expect(build).toMatch(/ARG BLUFF_APP_URL/);
    expect(build).toContain("node extension/build.mjs --outdir /tmp/bluff-extension --zip extension/release/bluff-checkout-guard.zip");
    expect(build.indexOf("ARG BLUFF_APP_URL")).toBeGreaterThan(build.indexOf("npm run build")); // changing it keeps the Next build cached
    const compose = fs.readFileSync("docker-compose.yml", "utf8");
    expect(compose).toMatch(/args: \{ BLUFF_APP_URL: "https:\/\/\$\{BASE_DOMAIN/);
    for (const f of [".gitignore", ".dockerignore"]) expect(fs.readFileSync(f, "utf8").split("\n"), f).toContain("extension/release");
  });
  it(".env.example documents every variable the config reads and holds no secrets", () => {
    const env = fs.readFileSync(".env.example", "utf8");
    for (const k of ["AGENT_MODE", "DATABASE_URL", "POSTGRES_PASSWORD", "NVIDIA_API_KEY", "NEMOTRON_MODEL", "NESSIE_API_KEY", "SESSION_SECRET", "DEMO_KEY", "EVAL_KEY", "BASE_DOMAIN", "ACME_EMAIL"]) expect(env).toContain(`${k}=`);
    expect(env).not.toMatch(/nvapi-|sk-[A-Za-z0-9]{10,}/);
    for (const line of env.split("\n")) { const m = /^(NVIDIA_API_KEY|NESSIE_API_KEY)=(.*)$/.exec(line); if (m) expect(m[2].trim()).toBe(""); }
  });
});
