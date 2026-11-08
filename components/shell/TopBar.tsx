import { getConfig } from "@/lib/config";
import { ModeBadge } from "../ui/ModeBadge";
import { PhonePreview } from "./PhonePreview";

/** The card Bluff watches (this visitor's private demo account), LIVE/DEMO badge and the T-Mobile phone preview (where Bluff's alerts arrive). */
export function TopBar() {
  const live = getConfig().agentMode === "live";
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
      <span className="font-grotesk text-lg font-bold lg:hidden">Bluff</span>
      <p className="text-sm text-dim" title="Your own private demo account with synthetic data">
        <span className="font-medium text-fg">Maya&apos;s card</span> · Capital One sandbox <span className="hidden text-xs sm:inline">(private demo account)</span>
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <ModeBadge mode={live ? "live" : "demo"} />
        <PhonePreview />
      </div>
    </header>
  );
}
