import { createHash } from "node:crypto";

/** Deterministic UUID from a namespace + key (so committed eval files can reference stable ids). */
export function detId(ns: string, key: string): string {
  const h = createHash("sha1").update(`${ns}:${key}`).digest("hex");
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}
