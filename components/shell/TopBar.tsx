import { getConfig } from "@/lib/config";
import { DealerButton } from "../table/DealerButton";
import { PhonePreview } from "./PhonePreview";

/** The top rail: demo user, the dealer-button mode badge (LIVE or DEMO) and the T-Mobile phone resting on the rail. */
export function TopBar() {
  const live = getConfig().agentMode === "live";
  return (
    <header className="rail-edge sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b brass-hairline px-4 py-2 shadow-[0_8px_20px_-10px_rgba(0,0,0,0.8)]">
      <span className="relative serif text-xl font-semibold brass-text lg:hidden">Bluff</span>
      <p className="relative order-3 basis-full text-xs text-dim lg:order-1 lg:basis-auto lg:text-sm">Signed in as <span className="font-semibold text-fg">Maya</span> <span className="text-xs">(demo user)</span></p>
      <div className="relative order-2 ml-auto flex items-center gap-3">
        <DealerButton mode={live ? "live" : "demo"} />
        <PhonePreview />
      </div>
    </header>
  );
}
