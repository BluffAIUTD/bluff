// Builds the unpacked extension into extension/dist. BLUFF_APP_URL = the deployed app (default http://localhost:3000).
import { build } from "esbuild";
import fs from "node:fs";

const app = (process.env.BLUFF_APP_URL || "http://localhost:3000").replace(/\/$/, "");
const origin = new URL(app).origin;
fs.mkdirSync("extension/dist", { recursive: true });
const common = { bundle: true, format: "iife", target: "chrome110", define: { __BLUFF_APP__: JSON.stringify(app) }, logLevel: "info" };
await build({ ...common, entryPoints: ["extension/src/content.ts"], outfile: "extension/dist/content.js" });
await build({ ...common, entryPoints: ["extension/src/background.ts"], outfile: "extension/dist/background.js" });
const manifest = JSON.parse(fs.readFileSync("extension/manifest.template.json", "utf8"));
manifest.host_permissions = [`${origin}/*`];
fs.writeFileSync("extension/dist/manifest.json", JSON.stringify(manifest, null, 2));
console.log("extension built for", app);
