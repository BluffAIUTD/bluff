import { pageKeys, type PageSignals } from "../../lib/rules/signals";
import { KEYS } from "../../lib/rules/weights";

/**
 * Rules-only findings for this page, computed locally from the same yes/no signals the server uses (same keys as the
 * server's basic check). Shown when Bluff couldn't finish a check, so the panel is never empty. No score: without the
 * site's registration and other pages, a number would claim more than Bluff knows.
 */
export function basicFindings(signals: PageSignals, host: string): string[] {
  const keys = pageKeys(signals, { ageDays: null, tld: host.split(".").pop() });
  const warnings = keys.filter((k) => KEYS[k]?.dir === "scam").map((k) => KEYS[k].evidence);
  return warnings.length ? warnings : ["No warning signs on this page itself. Its other pages and its registration were not checked."];
}
