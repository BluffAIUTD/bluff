import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { NavLinks } from "@/components/shell/NavLinks";
import { TopBar } from "@/components/shell/TopBar";

export const dynamic = "force-dynamic";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-[#1d1610] focus:px-4 focus:py-2">Skip to content</a>
      <NavLinks />
      <div className="lg:pl-60">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-32 pt-10 sm:px-8 lg:pb-16">{children}</main>
      </div>
    </ToastProvider>
  );
}
