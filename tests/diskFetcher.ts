import fs from "node:fs";
import path from "node:path";
import type { Fetcher } from "@/lib/scan/net";

/** Serves stores/<slug>/ from disk for <slug>.localhost:3000 URLs: crawler tests run offline. */
export const diskFetcher: Fetcher = async (url) => {
  const u = new URL(url);
  const slug = u.hostname.split(".")[0];
  let file = path.join(process.cwd(), "stores", slug, u.pathname);
  if (u.pathname.endsWith("/")) file = path.join(file, "index.html");
  if (!fs.existsSync(file)) return { status: 404, headers: { "content-type": "text/html" }, body: "<title>Not found</title>", url, hops: [] };
  const type = file.endsWith(".html") ? "text/html" : file.endsWith(".xml") ? "application/xml" : "text/plain";
  return { status: 200, headers: { "content-type": type }, body: fs.readFileSync(file, "utf8"), url, hops: [] };
};
