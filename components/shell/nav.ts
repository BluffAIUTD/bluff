export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/scan", label: "Scan", icon: "search" },
  { href: "/check", label: "Check", icon: "shield" },
  { href: "/charges", label: "Charges", icon: "card" },
  { href: "/exposure", label: "Exposure", icon: "eye" },
  { href: "/play", label: "Play", icon: "cards" },
  { href: "/eval", label: "Eval", icon: "chart", desktopOnly: true },
  { href: "/privacy", label: "Privacy", icon: "lock" },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];

/** `/` is active only on exactly `/`; others on their prefix. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
