export const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: "home", slot: "tab" },
  { href: "/scan", label: "Scan", icon: "radar", slot: "tab" },
  { href: "/check", label: "Check", icon: "shield", slot: "fab" },
  { href: "/charges", label: "Charges", icon: "card", slot: "tab" },
  { href: "/exposure", label: "Exposure", icon: "eye", slot: "more" },
  { href: "/play", label: "Play", icon: "cards", slot: "more" },
  { href: "/eval", label: "Eval", icon: "chart", slot: "more" },
  { href: "/privacy", label: "Privacy", icon: "lock", slot: "more" },
] as const;

export type NavIcon = (typeof NAV_ITEMS)[number]["icon"];

/** `/` is active only on exactly `/`; others on their prefix. */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Shell-wide window events (kept dumb on purpose: no extra provider needed). */
export const EVT = { palette: "bluff:palette", phone: "bluff:phone", refresh: "bluff:refresh" } as const;
export const fire = (name: string) => { if (typeof window !== "undefined") window.dispatchEvent(new Event(name)); };
