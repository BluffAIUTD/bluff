"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { NAV_ITEMS, isActive } from "./nav";
import { ChipDisc } from "../table/chips";

/** Nav chip: a round chip holding the icon. Brass when active, dark with a brass ring otherwise. */
function NavChip({ icon, on, size }: { icon: (typeof NAV_ITEMS)[number]["icon"]; on: boolean; size: number }) {
  return (
    <span aria-hidden className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 transition duration-ui" style={{ opacity: on ? 1 : 0.9 }}>
        <ChipDisc tone={on ? "brass" : "black"} size={size} />
      </span>
      <Icon name={icon} className={`relative ${size > 36 ? "h-[18px] w-[18px]" : "h-4 w-4"} ${on ? "text-[#1d1408]" : "text-[#e9cf8f]"}`} />
    </span>
  );
}

/** Dealer tray on the left (desktop, 1024px and up), bottom tray on phones. Same order; desktop-only items are left off the 7-slot tray. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  return (
    <>
      <nav aria-label="Primary" className="rail-edge fixed inset-y-0 left-0 z-30 hidden w-60 flex-col gap-1 border-r brass-hairline p-3 shadow-[6px_0_24px_-8px_rgba(0,0,0,0.7)] lg:flex">
        <Link href="/" className="relative mb-5 mt-1 flex items-center gap-3 rounded-full px-2 py-2">
          <ChipDisc tone="scam" size={40}>
            <path d="M50 30 66 50 50 70 34 50Z" fill="#f4ead2" />
          </ChipDisc>
          <span className="flex flex-col leading-none">
            <span className="serif text-[26px] font-semibold tracking-tight brass-text">Bluff</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-dim">Call their bluff</span>
          </span>
        </Link>
        <div className="relative flex flex-col gap-1">
          {NAV_ITEMS.map((i) => {
            const on = isActive(path, i.href);
            return (
              <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
                className={`group relative flex min-h-[52px] items-center gap-3 rounded-full py-1 pl-1.5 pr-4 text-sm font-semibold transition duration-ui ${on ? "bg-white/[0.07] text-fg shadow-[inset_0_0_0_1px_rgba(217,180,107,0.45)]" : "text-dim hover:bg-white/[0.04] hover:text-fg"}`}>
                <NavChip icon={i.icon} on={on} size={40} />
                {i.label}
              </Link>
            );
          })}
        </div>
        <p className="relative mt-6 px-3 text-[11px] leading-snug text-dim">Synthetic data only. Bluff drafts, you decide.</p>
      </nav>
      <nav aria-label="Primary" className="rail-edge fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t brass-hairline pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_-8px_rgba(0,0,0,0.7)] lg:hidden">
        {NAV_ITEMS.filter((i) => !("desktopOnly" in i && i.desktopOnly)).map((i) => {
          const on = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`relative flex min-h-[60px] flex-col items-center justify-center gap-[3px] text-[10px] font-semibold ${on ? "text-brass" : "text-dim"}`}>
              <NavChip icon={i.icon} on={on} size={32} />
              {i.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
