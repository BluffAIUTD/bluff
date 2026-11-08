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

/** P3-1 linked-charge alert. */
export function chargeAlert(a: { amountCents: number; descriptor: string; host: string; exposureAt: Date | string }): string {
  return `$${(a.amountCents / 100).toFixed(2)} from ${a.descriptor} matches ${a.host}, where you entered your card on ${chicagoDate(a.exposureAt)}. Reply DISPUTE and I'll draft it.`;
}
