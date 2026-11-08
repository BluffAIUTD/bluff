import { getConfig } from "@/lib/config";
import { ModeBadge } from "../ui/ModeBadge";
import { PhonePreview } from "./PhonePreview";
import { Crumb, SearchButton } from "./TopBarClient";

/** Slim status bar: where you are, who you are, search, system mode, phone. */
export function TopBar() {
  const live = getConfig().agentMode === "live";
  return (
    <header className="sticky top-0 z-20 flex min-h-[52px] items-center gap-3 border-b border-line bg-bg/85 px-4 py-2 backdrop-blur">
      <Crumb />
      <p className="mono hidden text-[11px] text-dim md:block">
        <span className="text-gray-2">Maya</span> <span className="text-gray-4">/</span> demo user
      </p>
      <div className="ml-auto flex items-center gap-2">
        <SearchButton />
        <span className="mono hidden items-center gap-2 rounded-control border border-line px-2 py-[7px] text-[11px] text-dim sm:inline-flex" title={live ? "Checks run on the live Nemotron agent" : "The agent runs in its offline demo mode with labeled fixtures"}>
          <ModeBadge mode={live ? "live" : "demo"} />
          {live ? "Nemotron agent online" : "offline demo agent"}
        </span>
        <span className="sm:hidden"><ModeBadge mode={live ? "live" : "demo"} /></span>
        <PhonePreview />
      </div>
    </header>
  );
}
