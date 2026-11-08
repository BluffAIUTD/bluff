const LABEL: Record<string, string> = { card_number: "card", cvv: "card security code", ssn: "SSN", password: "password", phone: "phone number", dob: "date of birth", address: "address", email: "email", name: "name" };

export function listFields(types: string[]): string {
  const l = types.map((t) => LABEL[t] ?? t);
  if (!l.length) return "personal info";
  if (l.length === 1) return l[0];
  return `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`;
}

/** America/Chicago short date, e.g. "Nov 4" (spec: store UTC, display America/Chicago). */
export function chicagoDate(d: Date | string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/Chicago" }).format(new Date(d));
}

/** P3-1 exposure alert. */
export function exposureAlert(a: { fieldTypes: string[]; host: string; ageDays: number | null }): string {
  const age = a.ageDays == null ? "a site I couldn't verify" : `a site registered ${a.ageDays} day${a.ageDays === 1 ? "" : "s"} ago`;
  return `You just entered your ${listFields(a.fieldTypes)} on ${a.host}, ${age}. Reply WATCH and I'll check for charges from it.`;
}

/** P3-1 linked-charge alert. `via: "text"` when the exposure is the link in a scam text the user reported. */
export function chargeAlert(a: { amountCents: number; descriptor: string; host: string; exposureAt: Date | string; via?: "entered" | "text" }): string {
  const where = a.via === "text" ? `the link in the scam text you reported on ${chicagoDate(a.exposureAt)}` : `where you entered your card on ${chicagoDate(a.exposureAt)}`;
  return `$${(a.amountCents / 100).toFixed(2)} from ${a.descriptor} matches ${a.host}, ${where}. Reply DISPUTE and I'll draft it.`;
}

// ---- Safe Signal (bank scan → phone) ---------------------------------------------------------------------------------

/** "$189" for whole dollars (Nessie amounts), "$1.99" otherwise. */
export function usd(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The site's address as the user would recognize it: host only, no start path ("merchant:<name>" keys show the name). */
export const siteName = (host: string) => (host.startsWith("merchant:") ? host.slice(9) : host.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));

const joinAnd = (l: string[]) => (l.length <= 1 ? l.join("") : `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}`);

/** amountCents: the merchant's total over `charges` charges in the scanned window. */
export type SummaryItem = { descriptor: string; amountCents: number; charges: number; score: number; label: "likely_scam" | "unsure" | "looks_ok" };

/** After a full bank scan: one text listing the risky merchants (newest charge first; at most `max` named). */
export function scanSummaryAlert(a: { merchantsChecked: number; risky: SummaryItem[]; max?: number }): string {
  const max = a.max ?? 3;
  const n = a.risky.length;
  const allScam = a.risky.every((r) => r.label === "likely_scam");
  const what = allScam ? (n === 1 ? "looks like a scam" : "look like scams") : (n === 1 ? "looks risky" : "look risky");
  const named = a.risky.slice(0, max).map((r) => `${r.descriptor} ${usd(r.amountCents)}${r.charges > 1 ? ` over ${r.charges} charges` : ""} (score ${r.score})`);
  if (n > max) named.push(`${n - max} more`);
  const reply = n === 1 ? "Reply DISPUTE to draft a dispute, HOLD to pause new online charges, or SAFE if you recognize it."
    : "Reply DISPUTE to draft a dispute for the newest, HOLD to pause new online charges, or SAFE if you recognize it.";
  return `Bluff checked the websites behind ${a.merchantsChecked} merchant${a.merchantsChecked === 1 ? "" : "s"} on your Capital One card. ${n} ${what}: ${joinAnd(named)}. ${reply}`;
}

/** A new risky charge. Confidence and mode as given by the verdict; "(basic check)" when no AI review ran. */
export function newChargeAlert(a: {
  amountCents: number; descriptor: string; host: string; label: "likely_scam" | "unsure" | "looks_ok"; score: number; confidence: number;
  topFinding: string | null; basic: boolean; linked?: { via: "entered" | "text"; at: Date | string; fieldTypes?: string[] } | null;
}): string {
  const looks = a.label === "likely_scam" ? "it looks like a scam" : "it looks risky";
  const finding = a.topFinding ? `: ${a.topFinding.replace(/[.!]+$/, "")}` : "";
  const link = !a.linked ? "" : a.linked.via === "text"
    ? ` It matches the link in the scam text you reported on ${chicagoDate(a.linked.at)}.`
    : ` It matches the site where you entered your ${listFields(a.linked.fieldTypes ?? ["card_number"])} on ${chicagoDate(a.linked.at)}.`;
  // The scan keys a merchant with no website as "merchant:<name>": say so instead of naming a site.
  const checked = a.host.startsWith("merchant:") ? `Bluff couldn't find a website for this merchant, and ${looks.replace("it ", "the charge ")}` : `Bluff read ${siteName(a.host)} and ${looks}`;
  const body = `New charge: ${usd(a.amountCents)} at ${a.descriptor} on your Capital One card. ${checked} (score ${a.score}/100, ${Math.round(a.confidence * 100)}% sure)${finding}.${link} Reply DISPUTE, HOLD or SAFE.`;
  return a.basic ? `${body} (basic check)` : body;
}

/** Sent after a reported scam text with a link: what Bluff kept and what it will do. */
export function receivedLinkNote(host: string): string {
  return `I saved ${siteName(host)} from that text, not the text itself. If a charge from it shows up on your card, I'll link it back to this text and help you dispute it. Reply HOLD to pause new online charges, or SAFE if you trust the site.`;
}

export const HOLD_ON = "Safe Signal hold is ON (simulated). Bluff will decline new test purchases on your Capital One card before they reach Nessie, the bank sandbox, which has no real card lock. For a real lock, use your bank's app or call the number on your card. Reply UNHOLD to lift it.";
export const HOLD_OFF = "Safe Signal hold lifted. New purchases go through again, and I'm still watching your card.";
