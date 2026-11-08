"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";
import { EVT, NAV_ITEMS, fire, isActive } from "./nav";

function Mark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={className}>
      <circle cx="16" cy="16" r="12" fill="none" stroke="var(--accent)" strokeWidth="1.6" opacity=".45" />
      <circle cx="16" cy="16" r="7" fill="none" stroke="var(--accent)" strokeWidth="1.6" />
      <circle cx="16" cy="16" r="2.6" fill="var(--scam)" />
    </svg>
  );
}

/** Left icon rail (>= 1024px) and bottom nav with a floating Check action below that. Both are `nav[aria-label=Primary]`. */
export function NavLinks() {
  const path = usePathname() ?? "/";
  const [more, setMore] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => setMore(false), [path]);
  useEffect(() => {
    if (!more) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setMore(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [more]);

  const tabs = NAV_ITEMS.filter((i) => i.slot === "tab");
  const fab = NAV_ITEMS.find((i) => i.slot === "fab")!;
  const rest = NAV_ITEMS.filter((i) => i.slot === "more");
  const moreActive = rest.some((i) => isActive(path, i.href));
  const [left, right] = [tabs.slice(0, 2), tabs.slice(2)];

  const tab = (i: (typeof NAV_ITEMS)[number]) => {
    const on = isActive(path, i.href);
    return (
      <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
        className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${on ? "text-accent" : "text-dim"}`}>
        <Icon name={i.icon} className="h-5 w-5" />
        {i.label}
      </Link>
    );
  };

  return (
    <>
      <nav aria-label="Primary" className="fixed inset-y-0 left-0 z-30 hidden w-16 flex-col items-center gap-1 border-r border-line bg-surface/90 py-3 backdrop-blur lg:flex">
        <Link href="/" aria-label="Bluff home" className="mb-4 grid h-10 w-10 place-items-center rounded-control hover:bg-surface2"><Mark /></Link>
        {NAV_ITEMS.map((i) => {
          const on = isActive(path, i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined} aria-label={i.label}
              className={`group relative grid h-11 w-11 place-items-center rounded-control transition duration-ui ${on ? "bg-accent/10 text-accent" : "text-dim hover:bg-surface2 hover:text-fg"}`}>
              {on && <span aria-hidden className="absolute -left-[13px] top-2 h-7 w-[3px] rounded-r bg-accent shadow-[0_0_12px_var(--accent)]" />}
              <Icon name={i.icon} />
              <span aria-hidden className="mono pointer-events-none absolute left-[52px] z-40 hidden whitespace-nowrap rounded-control border border-line2 bg-surface3 px-2 py-1 text-[11px] text-fg shadow-lg group-hover:block group-focus-visible:block">{i.label}</span>
            </Link>
          );
        })}
        <div className="mt-auto flex flex-col items-center gap-1">
          <button type="button" onClick={() => fire(EVT.palette)} aria-label="Open command palette" className="grid h-11 w-11 place-items-center rounded-control text-dim hover:bg-surface2 hover:text-fg"><Icon name="command" /></button>
        </div>
      </nav>

      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        <div className="grid grid-cols-5">
          {left.map(tab)}
          <div className="relative flex justify-center">
            <Link href={fab.href} aria-label="Check" aria-current={isActive(path, fab.href) ? "page" : undefined}
              className={`absolute -top-6 grid h-14 w-14 place-items-center rounded-full bg-accent text-onaccent shadow-[0_0_28px_-4px_rgb(var(--accent-rgb)/0.75)] ring-4 ring-bg transition active:scale-95 ${isActive(path, fab.href) ? "brightness-110" : ""}`}>
              <Icon name="shield" className="h-6 w-6" />
            </Link>
            <span aria-hidden className="mt-auto pb-2 text-[10px] font-medium text-dim">&nbsp;</span>
          </div>
          {right.map(tab)}
          <button type="button" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-haspopup="dialog"
            className={`flex min-h-[60px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${moreActive || more ? "text-accent" : "text-dim"}`}>
            <Icon name="more" className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      {more && mounted && createPortal(
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button type="button" aria-label="Close menu" onClick={() => setMore(false)} className="fade-in absolute inset-0 bg-black/60" />
          <section role="dialog" aria-modal="true" aria-label="More" className="sheet-up absolute inset-x-0 bottom-0 rounded-t-[20px] border-t border-line2 bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="label mb-3">Go to</p>
            <ul className="grid grid-cols-2 gap-2">
              {rest.map((i) => (
                <li key={i.href}>
                  <Link href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined} className={`flex min-h-[52px] items-center gap-3 rounded-control border px-3 text-sm font-medium ${isActive(path, i.href) ? "border-accent/40 bg-accent/10 text-accent" : "border-line bg-surface2"}`}>
                    <Icon name={i.icon} className="h-5 w-5" />{i.label}
                  </Link>
                </li>
              ))}
              <li><button type="button" onClick={() => { setMore(false); fire(EVT.palette); }} className="flex min-h-[52px] w-full items-center gap-3 rounded-control border border-line bg-surface2 px-3 text-sm font-medium"><Icon name="search" className="h-5 w-5" />Search</button></li>
              <li><button type="button" onClick={() => { setMore(false); fire(EVT.phone); }} className="flex min-h-[52px] w-full items-center gap-3 rounded-control border border-line bg-surface2 px-3 text-sm font-medium"><Icon name="phone" className="h-5 w-5" />Phone</button></li>
            </ul>
          </section>
        </div>,
        document.body,
      )}
    </>
  );
}
