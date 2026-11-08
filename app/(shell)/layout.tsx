import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { NavLinks } from "@/components/shell/NavLinks";
import { TopBar } from "@/components/shell/TopBar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { DockPad, TraceDock, TraceDockProvider, TraceSheet } from "@/components/shell/TraceDock";

export const dynamic = "force-dynamic";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <TraceDockProvider>
        <a href="#main" className="mono sr-only z-[90] rounded-control bg-accent px-3 py-2 text-xs font-semibold text-onaccent focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Skip to content</a>
        <NavLinks />
        <DockPad>
          <TopBar />
          <main id="main" className="mx-auto w-full max-w-[1100px] px-4 pb-32 pt-6 sm:px-6 lg:pb-14">{children}</main>
        </DockPad>
        <TraceDock />
        <TraceSheet />
        <CommandPalette />
      </TraceDockProvider>
    </ToastProvider>
  );
}
