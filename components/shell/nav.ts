export const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/scan", label: "Scan" },
  { href: "/check", label: "Check" },
  { href: "/charges", label: "Charges" },
  { href: "/exposure", label: "Exposure" },
  { href: "/play", label: "Play" },
  { href: "/eval", label: "Eval", desktopOnly: true },
  { href: "/privacy", label: "Privacy" },
] as const;

/** Two-digit folio number for a nav item, by its place in the full list: 01 Overview ... 08 Privacy. */
export const folio = (index: number) => String(index + 1).padStart(2, "0");

/** `/` is active only on exactly `/`; others on their prefix. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
