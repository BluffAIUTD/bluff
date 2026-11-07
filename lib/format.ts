const TZ = "America/Chicago";
export const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortDate = (d: string | Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: TZ }).format(new Date(d));
export const longDateTime = (d: string | Date) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: TZ }).format(new Date(d));
export const FIELD_LABELS: Record<string, string> = { card_number: "card", cvv: "card security code", ssn: "SSN", password: "password", phone: "phone", dob: "date of birth", address: "address", email: "email", name: "name" };
