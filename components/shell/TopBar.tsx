import { getConfig } from "@/lib/config";
import { ModeBadge } from "../ui/ModeBadge";
import { CopyButton } from "./CopyButton";
import { PhonePreview } from "./PhonePreview";

/** Demo user, the Bluff Text number (copyable) and a LIVE/DEMO badge. */
export function TopBar() {
  const c = getConfig();
  const live = c.agentMode === "live" && c.photonMode === "live";
  const number = c.photon.number;
  return (
    <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line bg-bg/90 px-4 py-3 backdrop-blur">
      <span className="font-grotesk text-lg font-bold lg:hidden">Bluff</span>
      <p className="text-sm text-dim">Signed in as <span className="font-medium text-fg">Maya</span> <span className="text-xs">(demo user)</span></p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-2 text-sm text-dim">
          Text Bluff: <span className="num font-medium text-fg">{number || "demo mode"}</span>
          {number && <CopyButton text={number} />}
        </span>
        <ModeBadge mode={live ? "live" : "demo"} />
        <PhonePreview />
      </div>
    </header>
  );
}
