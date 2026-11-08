"use client";
import { TableMessage } from "@/components/ui/TableMessage";

export default function RootError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" className="min-h-screen px-4 pt-10">
      <TableMessage rank="!" suit="scam" title="Something went wrong" message="Bluff couldn't load this page. Nothing was changed. Try again in a moment."
        actions={<button type="button" onClick={reset} className="btn-brass inline-flex min-h-[48px] items-center rounded-full px-6 text-sm font-semibold">Try again</button>} />
    </main>
  );
}
