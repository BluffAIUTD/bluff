"use client";
import { usePathname } from "next/navigation";
import { Icon } from "./Icon";
import { EVT, NAV_ITEMS, fire, isActive } from "./nav";

export function Crumb() {
  const path = usePathname() ?? "/";
  const cur = NAV_ITEMS.find((i) => isActive(path, i.href));
  const sub = path.startsWith("/charges/") ? "detail" : null;
  return (
    <p className="mono flex items-center gap-1.5 text-[12px]" aria-label="Current location">
      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-accent shadow-[0_0_10px_var(--accent)] lg:hidden" />
      <span className="text-dim">bluff</span><span className="text-gray-5">/</span><span className="text-fg">{(cur?.label ?? "page").toLowerCase()}</span>
      {sub && <><span className="text-gray-5">/</span><span className="text-dim">{sub}</span></>}
    </p>
  );
}

export function SearchButton() {
  return (
    <button type="button" onClick={() => fire(EVT.palette)} aria-label="Search and commands" className="mono inline-flex min-h-[36px] items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-[12px] text-dim transition duration-ui hover:border-line2 hover:text-fg">
      <Icon name="search" className="h-4 w-4" />
      <span className="hidden sm:inline">Search</span>
      <kbd className="hidden rounded border border-line2 px-1 text-[10px] sm:inline">⌘K</kbd>
    </button>
  );
}
