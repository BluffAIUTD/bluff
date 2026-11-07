import { ApiError } from "../errors";

/** Normalize a user-entered URL; returns the canonical URL and lowercase host. */
export function parseUrl(input: string): { url: string; host: string } {
  const raw = input.trim();
  if (!raw) throw new ApiError("bad_input", "Paste a link or pick a store");
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { throw new ApiError("bad_input", "That doesn't look like a link"); }
  if (!/^https?:$/.test(u.protocol)) throw new ApiError("bad_input", "Only web links can be checked");
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".") && !/^[a-z0-9-]+$/.test(host)) throw new ApiError("bad_input", "That doesn't look like a link");
  return { url: u.toString(), host };
}
