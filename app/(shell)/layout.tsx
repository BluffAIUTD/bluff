import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import { NavLinks } from "@/components/shell/NavLinks";
import { TopBar } from "@/components/shell/TopBar";

export const dynamic = "force-dynamic";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <NavLinks />
      <div className="lg:pl-56">
        <TopBar />
        <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-28 pt-6 lg:pb-12">{children}</main>
      </div>
    </ToastProvider>
  );
}
