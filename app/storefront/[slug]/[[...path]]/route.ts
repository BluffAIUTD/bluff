import fs from "node:fs";
import path from "node:path";
import { STORES } from "@/data/stores";
import { storesDir } from "@/lib/agent/tools/pageSignals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".xml": "application/xml; charset=utf-8" };
const notFound = () => new Response("<!doctype html><title>Not found</title><h1>Not found</h1>", { status: 404, headers: { "content-type": TYPES[".html"], "x-robots-tag": "noindex" } });

/** Static file server for one demo storefront website (only files inside stores/<slug>/, only text types). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; path?: string[] }> }) {
  const { slug, path: segs = [] } = await params;
  if (!STORES.some((s) => s.slug === slug)) return notFound();
  if (segs.some((s) => !/^[a-z0-9._-]+$/i.test(s) || s.startsWith("."))) return notFound();
  const dir = path.join(storesDir(), slug);
  let file = path.join(dir, ...segs);
  if (!segs.length || !path.extname(file)) file = path.join(file, "index.html");
  if (!file.startsWith(dir + path.sep) || !fs.existsSync(file)) return notFound();
  const type = TYPES[path.extname(file)];
  if (!type) return notFound();
  return new Response(fs.readFileSync(file), { headers: { "content-type": type, "x-robots-tag": "noindex", "cache-control": "no-store" } });
}
