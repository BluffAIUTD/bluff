// Builds the Chrome extension "Bluff Checkout Guard".
//   BLUFF_APP_URL=https://bluffai.us node extension/build.mjs [--outdir <dir>] [--zip [<file>]]
// --outdir  unpacked extension (default extension/dist; load it with chrome://extensions → Load unpacked)
// --zip     also pack it (default extension/release/bluff-checkout-guard.zip, which the app serves at
//           /downloads/bluff-checkout-guard.zip) plus a small <name>.json with the version and app address.
// BLUFF_APP_URL is baked in: the app the extension talks to (default http://localhost:3000; required with --zip, so a
// downloadable build never points at a developer's machine by accident).
import { build } from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { zipFiles } from "./zip.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DEFAULT_ZIP = path.join(ROOT, "extension", "release", "bluff-checkout-guard.zip");
const ICONS = [16, 32, 48, 128].map((s) => `icons/icon${s}.png`);

function fail(msg) { console.error(`ext:build: ${msg}`); process.exit(1); }
function shown(p) { const r = path.relative(process.cwd(), p); return r && !r.startsWith("..") ? r : p; }

function parseArgs(argv) {
  const out = { outdir: path.join(ROOT, "extension", "dist"), zip: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const [flag, inline] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, undefined];
    if (flag === "--outdir") {
      const v = inline ?? argv[++i];
      if (!v) fail("--outdir needs a directory");
      out.outdir = path.resolve(v);
    } else if (flag === "--zip") {
      const next = inline ?? (argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : undefined);
      out.zip = next ? path.resolve(next) : DEFAULT_ZIP;
    } else fail(`unknown option ${a}`);
  }
  return out;
}

function appOrigin(raw) {
  let u;
  try { u = new URL(raw); } catch { fail(`BLUFF_APP_URL is not a URL: ${raw}`); }
  if (!/^https?:$/.test(u.protocol)) fail(`BLUFF_APP_URL must be http(s): ${raw}`);
  return u.origin;
}

const args = parseArgs(process.argv.slice(2));
const rawApp = process.env.BLUFF_APP_URL?.trim();
if (args.zip && !rawApp) fail("set BLUFF_APP_URL (e.g. https://bluffai.us) when building the downloadable zip");
const app = appOrigin(rawApp || "http://localhost:3000");

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, "manifest.template.json"), "utf8"));
manifest.host_permissions = [`${app}/*`];
manifest.homepage_url = `${app}/extension`;

const common = {
  bundle: true, format: "iife", target: "chrome110", logLevel: "warning", write: false,
  define: { __BLUFF_APP__: JSON.stringify(app), __BLUFF_VERSION__: JSON.stringify(manifest.version) },
};
const scripts = {};
for (const name of ["content", "background", "popup"]) {
  const r = await build({ ...common, entryPoints: [path.join(HERE, "src", `${name}.ts`)], outfile: `${name}.js` });
  scripts[`${name}.js`] = r.outputFiles[0].contents;
}

const files = {
  "manifest.json": JSON.stringify(manifest, null, 2) + "\n",
  ...scripts,
  "popup.html": fs.readFileSync(path.join(HERE, "src", "popup.html")),
  ...Object.fromEntries(ICONS.map((p) => [p, fs.readFileSync(path.join(HERE, p))])),
  "INSTALL.txt": [
    "Bluff Checkout Guard " + manifest.version + " (checks stores with " + app + ")",
    "",
    "1. Unzip this file. You get a folder with manifest.json inside.",
    "2. Open chrome://extensions and turn on Developer mode (top right).",
    "3. Click \"Load unpacked\" and choose that folder.",
    "4. Pin Bluff from the puzzle-piece menu. Click it to see what it does.",
    "",
    "It stays idle until a page asks for a card number or CVV. It never reads what you type.",
    "More: " + app + "/extension",
    "",
  ].join("\n"),
};

fs.mkdirSync(path.join(args.outdir, "icons"), { recursive: true });
for (const [name, data] of Object.entries(files)) fs.writeFileSync(path.join(args.outdir, name), data);
console.log(`extension ${manifest.version} built for ${app} → ${shown(args.outdir)}`);

if (args.zip) {
  const zip = zipFiles(Object.entries(files).map(([name, data]) => ({ name, data })));
  fs.mkdirSync(path.dirname(args.zip), { recursive: true });
  fs.writeFileSync(args.zip, zip);
  const info = { name: manifest.name, version: manifest.version, app, bytes: zip.length, builtAt: new Date().toISOString() };
  fs.writeFileSync(args.zip.replace(/\.zip$/i, "") + ".json", JSON.stringify(info, null, 2) + "\n");
  console.log(`zip: ${shown(args.zip)} (${zip.length} bytes)`);
}
