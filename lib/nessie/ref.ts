import { createHmac } from "node:crypto";
import { getConfig } from "../config";

/**
 * Every visitor shares one Nessie customer, so a purchase pushed from Bluff carries a short visitor tag in its
 * description: "VOLTDEALS OUTLET · voltdeals-outlet.demo · ref 6a1f0c2b". The tag is an HMAC of the visitor id (it
 * reveals nothing about the session). The sync shows a tagged purchase only to the visitor whose tag it carries;
 * untagged purchases (the seed, anything posted from Postman) are shared by everyone.
 */
const REF_RE = /\s*·\s*ref\s+([a-z0-9]{4,16})\s*$/i;

export function pushRef(userId: string): string {
  return createHmac("sha256", getConfig().sessionSecret).update(`nessie-ref:${userId}`).digest("hex").slice(0, 8);
}

/** "DESC · site · ref 6a1f0c2b" → { text: "DESC · site", ref: "6a1f0c2b" }; untagged text is returned as-is. */
export function splitRef(description: string | undefined | null): { text: string; ref: string | null } {
  const d = description ?? "";
  const m = REF_RE.exec(d);
  return m ? { text: d.slice(0, m.index).trim(), ref: m[1].toLowerCase() } : { text: d, ref: null };
}

export const withRef = (text: string, ref: string) => `${text} · ref ${ref}`;

/** Calendar day in America/Chicago (YYYY-MM-DD): Nessie purchase dates are days, and the demo runs in Dallas. */
export function chicagoDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
