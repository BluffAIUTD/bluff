import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { extensionZip, extensionZipPath } from "./download";
import { GET } from "@/app/downloads/bluff-checkout-guard.zip/route";

const env = { ...process.env };
afterEach(() => { process.env = { ...env }; });

describe("extension download", () => {
  it("defaults to extension/release/bluff-checkout-guard.zip (what the Dockerfile copies into the runtime image)", () => {
    delete process.env.EXTENSION_ZIP_PATH;
    expect(path.relative(process.cwd(), extensionZipPath())).toBe(path.join("extension", "release", "bluff-checkout-guard.zip"));
    expect(fs.readFileSync("Dockerfile", "utf8")).toContain("COPY --from=build /app/extension/release ./extension/release");
  });

  it("404s with a pointer to /extension when the zip isn't built", async () => {
    process.env.EXTENSION_ZIP_PATH = path.join(os.tmpdir(), "bluff-missing", "nope.zip");
    expect(extensionZip()).toBeNull();
    const r = await GET();
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("/extension");
  });

  it("serves the zip as an attachment with its info", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bluff-dl-"));
    const zip = path.join(dir, "bluff-checkout-guard.zip");
    fs.writeFileSync(zip, Buffer.from("PK\x05\x06" + "\0".repeat(18), "binary"));
    fs.writeFileSync(path.join(dir, "bluff-checkout-guard.json"), JSON.stringify({ version: "1.1.0", app: "https://bluffai.us" }));
    process.env.EXTENSION_ZIP_PATH = zip;
    expect(extensionZip()).toEqual({ path: zip, bytes: 22, version: "1.1.0", app: "https://bluffai.us" });
    const r = await GET();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/zip");
    expect(r.headers.get("content-disposition")).toBe('attachment; filename="bluff-checkout-guard.zip"');
    expect(Buffer.from(await r.arrayBuffer()).equals(fs.readFileSync(zip))).toBe(true);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
