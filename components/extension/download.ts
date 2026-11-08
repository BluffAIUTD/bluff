import fs from "node:fs";
import path from "node:path";

/** Stable public URL of the Chrome extension zip (served by app/downloads/bluff-checkout-guard.zip/route.ts). */
export const EXTENSION_ZIP_URL = "/downloads/bluff-checkout-guard.zip";
export const EXTENSION_ZIP_NAME = "bluff-checkout-guard.zip";

/** Built by `npm run ext:zip` locally, or during the Docker build (Dockerfile, ARG BLUFF_APP_URL). Not committed. */
export function extensionZipPath(): string {
  return process.env.EXTENSION_ZIP_PATH || path.join(process.cwd(), "extension", "release", EXTENSION_ZIP_NAME);
}

export type ExtensionZip = { path: string; bytes: number; version: string | null; app: string | null };

/** The zip on disk with the version and app address it was built for, or null when it hasn't been built. */
export function extensionZip(): ExtensionZip | null {
  const p = extensionZipPath();
  let bytes: number;
  try { bytes = fs.statSync(p).size; } catch { return null; }
  let info: { version?: unknown; app?: unknown } = {};
  try { info = JSON.parse(fs.readFileSync(p.replace(/\.zip$/i, "") + ".json", "utf8")); } catch { /* built without info file */ }
  return {
    path: p, bytes,
    version: typeof info.version === "string" ? info.version : null,
    app: typeof info.app === "string" ? info.app : null,
  };
}
