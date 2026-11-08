"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, folio, isActive } from "./nav";

/** Section nav: a ruled strip of folios under the masthead on desktop, a bottom tab bar on phones. Same order; desktop-only items are left off the 7-slot tab bar. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <>
      <nav aria-label="Primary" className="no-print sticky top-0 z-30 hidden border-y border-ink bg-bg lg:block">
        <ul className="mx-auto flex max-w-6xl items-stretch justify-between px-4">
          {NAV_ITEMS.map((i, n) => {
            const on = isActive(path, i.href);
            return (
              <li key={i.href}>
                <Link href={i.href} aria-current={on ? "page" : undefined}
                  className={`group relative flex min-h-[44px] items-center gap-2 px-3 text-[15px] transition duration-ui ${on ? "font-semibold text-fg" : "text-dim hover:text-fg"}`}>
                  <span className={`folio ${on ? "text-scam" : "text-gray-5"}`}>{folio(n)}</span>
                  {i.label}
                  <span aria-hidden className={`absolute inset-x-3 -bottom-px h-[3px] ${on ? "bg-ink" : "bg-transparent group-hover:bg-gray-3"}`} />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav aria-label="Primary" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t-2 border-ink bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV_ITEMS.map((i, n) => ({ i, n })).filter(({ i }) => !("desktopOnly" in i && i.desktopOnly)).map(({ i, n }) => {
          const on = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`relative flex min-h-[58px] flex-col items-center justify-center gap-[3px] text-[11px] ${on ? "font-semibold text-fg" : "text-dim"}`}>
              <span aria-hidden className={`absolute inset-x-2 -top-[2px] h-[3px] ${on ? "bg-scam" : "bg-transparent"}`} />
              <span className={`folio ${on ? "text-scam" : "text-gray-5"}`}>{folio(n)}</span>
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
