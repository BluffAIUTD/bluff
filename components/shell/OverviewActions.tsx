"use client";
import Link from "next/link";
import { Icon } from "./Icon";
import { EVT, fire } from "./nav";

export function OverviewActions() {
  return (
    <div className="relative mt-6 flex flex-wrap gap-3">
      <Link href="/check" className="inline-flex min-h-[48px] items-center gap-2 rounded-control bg-accent px-5 text-sm font-semibold text-onaccent shadow-[0_0_28px_-6px_rgb(var(--accent-rgb)/0.7)] transition duration-ui hover:brightness-110">Try Bluff on a store <Icon name="arrow" className="h-4 w-4" /></Link>
      <button type="button" onClick={() => fire(EVT.palette)} className="mono inline-flex min-h-[48px] items-center gap-2 rounded-control border border-line2 bg-surface2 px-4 text-[12px] text-gray-2 transition duration-ui hover:border-gray-4 hover:text-fg">
        <Icon name="search" className="h-4 w-4" />Jump to anything <kbd className="rounded border border-line2 px-1 text-[10px] text-dim">⌘K</kbd>
      </button>
    </div>
  );
}
