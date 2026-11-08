import fs from "node:fs";
import { EXTENSION_ZIP_NAME, extensionZip } from "@/components/extension/download";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Chrome extension ("Checkout Guard"), packed for this deployment's address. Install steps: /extension. */
export async function GET() {
  const zip = extensionZip();
  if (!zip) {
    return new Response("The Checkout Guard zip hasn't been built on this server. See /extension for how to build it.\n", {
      status: 404, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const data = new Uint8Array(fs.readFileSync(zip.path));
  return new Response(data, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${EXTENSION_ZIP_NAME}"`,
      "content-length": String(data.byteLength),
      "cache-control": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}
