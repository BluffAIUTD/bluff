import type { ReactNode } from "react";
import Link from "next/link";
import { ToastProvider } from "@/components/ui/Toast";
import { NavLinks } from "@/components/shell/NavLinks";
import { TopBar } from "@/components/shell/TopBar";

export const dynamic = "force-dynamic";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <TopBar />
      <NavLinks />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-8 pt-8 lg:pt-10">{children}</main>
      <footer className="no-print mx-auto mb-24 mt-12 max-w-6xl px-4 lg:mb-10">
        <div className="rule-top flex flex-col gap-2 pt-4 text-xs text-dim sm:flex-row sm:justify-between">
          <p className="max-w-xl">All people, stores and charges are synthetic. Bluff reads public pages and the shape of what you tell it, never what you typed. It drafts; it never files, sends or pays.</p>
          <p className="folio"><Link href="/privacy" className="underline underline-offset-4 hover:text-fg">Privacy</Link> · Call their bluff.</p>
        </div>
      </footer>
    </ToastProvider>
  );
}
