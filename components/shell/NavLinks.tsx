"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { NAV_ITEMS, isActive } from "./nav";

/** Left rail on desktop (≥1024px), bottom tab bar below. Same order; desktop-only items are left off the 7-slot tab bar. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <>
      <nav aria-label="Primary" className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col gap-1 border-r border-line bg-surface p-3 lg:flex">
        <Link href="/" className="mb-4 flex items-center gap-2 px-3 py-2 font-grotesk text-xl font-bold tracking-tight">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full bg-scam" /> Bluff
        </Link>
        {NAV_ITEMS.map((i) => {
          const on = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`flex min-h-[44px] items-center gap-3 rounded-control px-3 text-sm font-medium transition duration-ui ${on ? "bg-accent/20 text-fg" : "text-dim hover:bg-surface2 hover:text-fg"}`}>
              <Icon name={i.icon} /> {i.label}
            </Link>
          );
        })}
      </nav>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.filter((i) => !("desktopOnly" in i && i.desktopOnly)).map((i) => {
          const on = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-[2px] text-[10px] font-medium ${on ? "text-fg" : "text-dim"}`}>
              <Icon name={i.icon} className={`h-5 w-5 ${on ? "text-accent" : ""}`} />
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
