import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { crc32, crc32Fallback, zipFiles } from "./zip.mjs";

/** Independent reader: walks the central directory (not the writer's code) and inflates every entry. */
function readZip(buf: Buffer): Map<string, Buffer> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(eocd).toBeGreaterThan(0);
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(buf.readUInt32LE(p)).toBe(0x02014b50);
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    expect(buf.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const body = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(body) : Buffer.from(body);
    expect(data.length).toBe(usize);
    expect(crc32Fallback(data)).toBe(crc);
    out.set(name, data);
    p += 46 + nlen + elen + clen;
  }
  return out;
}

const hasUnzip = spawnSync("unzip", ["-v"]).status === 0;

describe("zip writer", () => {
  it("crc32 matches the known IEEE value, with and without zlib.crc32", () => {
    const data = Buffer.from("123456789");
    expect(crc32Fallback(data)).toBe(0xcbf43926);
    expect(crc32(data)).toBe(0xcbf43926);
  });
  it("round-trips deflated and stored entries", () => {
    const big = "checkout guard ".repeat(500);
    const png = fs.readFileSync(path.join(__dirname, "icons", "icon16.png"));
    const zip = zipFiles([{ name: "a.txt", data: big }, { name: "icons/i.png", data: png }, { name: "empty.txt", data: "" }]);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.txt", "icons/i.png", "empty.txt"]);
    expect(files.get("a.txt")!.toString()).toBe(big);
    expect(files.get("icons/i.png")!.equals(png)).toBe(true);
    expect(zip.length).toBeLessThan(big.length); // text was compressed
    expect(zipFiles([{ name: "a.txt", data: big }]).equals(zipFiles([{ name: "a.txt", data: big }]))).toBe(true); // reproducible
  });
  it("rejects unsafe or duplicate names", () => {
    expect(() => zipFiles([{ name: "../x", data: "" }])).toThrow(/bad zip entry/);
    expect(() => zipFiles([{ name: "/x", data: "" }])).toThrow(/bad zip entry/);
    expect(() => zipFiles([{ name: "x", data: "" }, { name: "x", data: "" }])).toThrow(/duplicate/);
  });
});

describe("extension build (npm run ext:zip)", () => {
  let dir: string;
  beforeAll(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "bluff-ext-")); });
  afterAll(() => { fs.rmSync(dir, { recursive: true, force: true }); });
  const run = (args: string[], env: Record<string, string | undefined>) =>
    spawnSync(process.execPath, [path.join(__dirname, "build.mjs"), ...args], { env: { ...process.env, BLUFF_APP_URL: undefined, ...env }, encoding: "utf8" });

  it("refuses to package without BLUFF_APP_URL", () => {
    const r = run(["--outdir", path.join(dir, "x"), "--zip", path.join(dir, "x.zip")], {});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("BLUFF_APP_URL");
    expect(fs.existsSync(path.join(dir, "x.zip"))).toBe(false);
  });

  it("builds an installable zip pointed at the deployment, with icons and the popup", () => {
    const zipPath = path.join(dir, "bluff-checkout-guard.zip");
    const r = run(["--outdir", path.join(dir, "out"), "--zip", zipPath], { BLUFF_APP_URL: "https://bluffai.us/" });
    expect(r.status, r.stderr).toBe(0);
    const files = readZip(fs.readFileSync(zipPath));
    expect([...files.keys()].sort()).toEqual(["INSTALL.txt", "background.js", "content.js", "icons/icon128.png", "icons/icon16.png", "icons/icon32.png", "icons/icon48.png", "manifest.json", "popup.html", "popup.js"]);
    const m = JSON.parse(files.get("manifest.json")!.toString());
    expect(m).toMatchObject({
      manifest_version: 3, version: "1.1.0", homepage_url: "https://bluffai.us/extension", host_permissions: ["https://bluffai.us/*"],
      action: { default_popup: "popup.html" }, background: { service_worker: "background.js" },
    });
    for (const p of [...Object.values(m.icons as Record<string, string>), ...Object.values(m.action.default_icon as Record<string, string>)]) expect(files.has(p), p).toBe(true);
    expect(m.description.length).toBeLessThanOrEqual(132); // Chrome's limit
    expect(files.get("content.js")!.toString()).toContain('"https://bluffai.us"');
    expect(files.get("popup.html")!.toString()).toContain('<script src="popup.js"></script>');
    // PNG signature on every icon
    for (const s of [16, 32, 48, 128]) expect(files.get(`icons/icon${s}.png`)!.subarray(1, 4).toString()).toBe("PNG");
    const info = JSON.parse(fs.readFileSync(path.join(dir, "bluff-checkout-guard.json"), "utf8"));
    expect(info).toMatchObject({ version: "1.1.0", app: "https://bluffai.us", bytes: fs.statSync(zipPath).size });
    // The unpacked copy matches the zip.
    expect(fs.readFileSync(path.join(dir, "out", "manifest.json"), "utf8")).toBe(files.get("manifest.json")!.toString());
    if (hasUnzip) {
      expect(execFileSync("unzip", ["-t", zipPath], { encoding: "utf8" })).toContain("No errors detected");
      expect(execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" })).toMatch(/10 files/);
    }
  }, 30_000);
});
