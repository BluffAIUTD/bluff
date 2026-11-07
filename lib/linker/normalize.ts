/** Processor prefixes stripped before matching (product_spec edge cases; engineering_spec §6.2). */
const PREFIX = /^\s*(?:SQ\s*\*|SP\s*\*|TST\s*\*|PAYPAL\s*\*|PP\s*\*)\s*/i;
const LEGAL = new Set(["llc", "inc", "co", "corp", "ltd", "company"]);

/** Lowercase merchant tokens from a raw card descriptor, e.g. "SQ *BAYOU BAKERY 4411" → ["bayou","bakery"]. */
export function descriptorTokens(raw: string): string[] {
  const stripped = (raw ?? "").replace(PREFIX, "");
  return stripped
    .toLowerCase()
    .replace(/[0-9]+/g, " ")
    .split(/[^a-zÀ-ɏ]+/)
    .filter((t) => t && !LEGAL.has(t));
}

export function normalizeDescriptor(raw: string): string {
  return descriptorTokens(raw).join(" ");
}

/** Registrable-ish label for a host: "www.fastkicks-shop.example.com" with base "example.com" → "fastkicks-shop". */
export function labelFromHost(host: string, baseDomain?: string): string {
  let h = (host ?? "").toLowerCase().replace(/^https?:\/\//, "").replace(/[/:?#].*$/, "").replace(/^www\./, "");
  if (baseDomain) {
    const b = baseDomain.toLowerCase().replace(/:\d+$/, "");
    if (h.endsWith("." + b)) h = h.slice(0, -(b.length + 1));
    else if (h === b) return b.split(".")[0];
  }
  const parts = h.split(".");
  if (parts.length === 1) return parts[0];
  // Strip the public suffix heuristically (last label; second-level like co.uk handled).
  const sld = parts.length >= 3 && ["co", "com", "org", "net", "gov", "ac"].includes(parts[parts.length - 2]) && parts[parts.length - 1].length === 2;
  return parts[parts.length - (sld ? 3 : 2)] ?? parts[0];
}

/** Tokens of a label such as "fastkicks-shop". */
export function labelTokens(label: string): string[] {
  return label.toLowerCase().split(/[^a-zÀ-ɏ0-9]+/).filter(Boolean);
}
