/**
 * Five sections, all on the phone tab bar. `also` lists routes that live under a section without their own nav item
 * (a charge opened from Card watch, the exposure log and the extension page under Check a site, the eval under Privacy).
 */
export const NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home", also: [] },
  { href: "/scan", label: "Card watch", icon: "card", also: ["/charges"] },
  { href: "/check", label: "Check a site", icon: "shield", also: ["/exposure", "/extension"] },
  { href: "/play", label: "Daily game", icon: "cards", also: [] },
  { href: "/privacy", label: "Privacy", icon: "lock", also: ["/eval"] },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];

const under = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");

/** `/` is active only on exactly `/`; others on their prefix or one of their `also` routes. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const also: readonly string[] = NAV_ITEMS.find((i) => i.href === href)?.also ?? [];
  return under(pathname, href) || also.some((h) => under(pathname, h));
}
