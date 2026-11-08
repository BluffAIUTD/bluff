import { signalsFromParts } from "../../lib/signals/pure";
import type { PageSignals } from "../../lib/rules/signals";

/**
 * Sensitive-field detection and local page signals for the Checkout Guard extension.
 * PRIVACY: this module never reads an input's `.value` (or any live typed text). It inspects attributes and labels only,
 * and the signals it returns are booleans/numbers.
 */
export type Sensitive = "card_number" | "cvv" | "ssn" | "password" | "phone" | "dob" | "address";

const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "checkbox", "radio", "file", "image", "range", "color"]);
const PAYMENT_IFRAME = /(stripe|paypal|braintree|adyen|squareup|checkout|pay)\./i;

function labelTextFor(el: Element, doc: Document): string {
  const id = el.getAttribute("id");
  const byFor = id ? doc.querySelector(`label[for="${CSS.escape(id)}"]`) : null;
  const wrap = el.closest("label");
  return ((byFor ?? wrap)?.textContent ?? "").toLowerCase();
}

function classify(el: Element, doc: Document): Sensitive[] {
  const type = (el.getAttribute("type") ?? "text").toLowerCase();
  if (SKIP_TYPES.has(type)) return [];
  const ac = (el.getAttribute("autocomplete") ?? "").toLowerCase();
  const hay = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("placeholder"), el.getAttribute("aria-label"), labelTextFor(el, doc)].join(" ").toLowerCase();
  const out: Sensitive[] = [];
  if (ac === "cc-number" || /(card.?(number|num|no)\b|cc.?num|ccnumber|card_number)/.test(hay)) out.push("card_number");
  if (ac === "cc-csc" || /\b(cvv|cvc|csc)\b|security code/.test(hay)) out.push("cvv");
  if (type === "password" || ac === "current-password" || ac === "new-password") out.push("password");
  if (/\bssn\b|social security/.test(hay)) out.push("ssn");
  if (type === "tel" || ac.startsWith("tel") || /\b(phone|mobile)\b/.test(hay)) out.push("phone");
  if (ac.startsWith("bday") || /\b(dob|birth)/.test(hay)) out.push("dob");
  if (ac === "street-address" || ac === "address-line1" || (/\b(street|address\s?line|address1|shipping address)\b/.test(hay) && !/e-?mail/.test(hay))) out.push("address");
  return out;
}

export function sensitiveFieldTypes(doc: Document): Sensitive[] {
  const found = new Set<Sensitive>();
  for (const el of Array.from(doc.querySelectorAll("input, textarea"))) for (const t of classify(el, doc)) found.add(t);
  // Card fields inside a payment iframe (Stripe Elements etc.): detect via the iframe host / title instead of its contents.
  for (const f of Array.from(doc.querySelectorAll("iframe"))) {
    const src = f.getAttribute("src") ?? "";
    let host = "";
    try { host = new URL(src, doc.baseURI).hostname + "."; } catch { /* relative or invalid */ }
    if (PAYMENT_IFRAME.test(host) || /payment|card/i.test(f.getAttribute("title") ?? "")) found.add("card_number");
  }
  return [...found];
}

/** Visible text without scripts, styles or form controls (input values are not text nodes, and are never touched). */
export function visibleText(doc: Document): string {
  const out: string[] = [];
  const w = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|OPTION)$/.test(p.tagName)) continue;
    out.push(n.nodeValue ?? "");
  }
  return out.join(" ");
}

export function computePageSignals(doc: Document, loc: { protocol: string; hostname: string }): PageSignals {
  return signalsFromParts({
    text: visibleText(doc),
    title: doc.title ?? "",
    linkTexts: Array.from(doc.querySelectorAll("a")).map((a) => a.textContent ?? ""),
    hasCardField: !!doc.querySelector('input[autocomplete="cc-number"], input[name*="card" i]'),
    hasCountdownAttr: !!doc.querySelector("[data-countdown]"),
    https: loc.protocol === "https:",
    hostLabel: loc.hostname,
  });
}

/**
 * Field types that start a check on their own: this is a *checkout* guard. A password, phone, birthday or address field
 * alone (a login or sign-up form) only offers a click-to-check chip, so logging in somewhere never sends that domain.
 */
export const AUTO_RUN_TYPES: readonly Sensitive[] = ["card_number", "cvv", "ssn"];
export const autoRuns = (types: readonly string[]) => types.some((t) => (AUTO_RUN_TYPES as readonly string[]).includes(t));

/**
 * The app's own hosts: its canonical address plus the bluff.<domain> alias (which redirects to it). Exact names only:
 * the demo stores live on other subdomains of the same domain (fastkicks-shop.bluffai.us) and must still be checked.
 */
export function appHosts(appHost: string): string[] {
  const a = appHost.toLowerCase().replace(/^www\./, "");
  const rest = a.startsWith("bluff.") ? a.slice("bluff.".length) : null;
  return rest && (rest.includes(".") || rest === "localhost") ? [a, rest] : [a, `bluff.${a}`];
}

/** Idle on the Bluff app itself, on hosts the user marked SAFE, and on a seed list of top retailers and banks. */
export function shouldRun(host: string, opts: { safeHosts: string[]; allowlist: string[]; appHost: string }): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  if (appHosts(opts.appHost).includes(h)) return false;
  const hit = (list: string[]) => list.some((x) => h === x || h.endsWith("." + x));
  return !hit(opts.safeHosts) && !hit(opts.allowlist);
}
