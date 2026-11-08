import Link from "next/link";
import { getConfig } from "@/lib/config";
import { ModeBadge } from "../ui/ModeBadge";
import { PhonePreview } from "./PhonePreview";

/** Masthead: wordmark, demo user, LIVE/DEMO badge and the T-Mobile phone preview (where Bluff's alerts arrive). */
export function TopBar() {
  const live = getConfig().agentMode === "live";
  return (
    <header className="no-print border-t-[6px] border-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 sm:py-4">
        <Link href="/" className="flex items-baseline gap-3" aria-label="Bluff, home">
          <span className="font-display text-[34px] font-semibold leading-none tracking-tight sm:text-[42px]">Bluff<span className="text-scam">.</span></span>
          <span className="eyebrow hidden sm:inline">Case file / Call their bluff</span>
          <span className="eyebrow sm:hidden">Maya · demo</span>
        </Link>
        <p className="ml-auto hidden text-sm text-dim md:block">Signed in as <span className="font-medium text-fg">Maya</span> <span className="font-mono text-xs">(demo user)</span></p>
        <div className="ml-auto flex items-center gap-2 md:ml-0">
          <ModeBadge mode={live ? "live" : "demo"} />
          <PhonePreview />
        </div>
      </div>
    </header>
  );
}
