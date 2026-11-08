"use client";
import Link from "next/link";

/** Route-level error boundary. Shows a calm message, never the raw error. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main id="main" role="alert" className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <p className="eyebrow">Case file / something went wrong</p>
      <h1 className="font-display text-[40px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">This page could not be opened<span className="text-scam">.</span></h1>
      <p className="max-w-xl text-lg leading-relaxed text-dim">Nothing you entered was lost or sent. Try again, or head back to the overview.</p>
      {error.digest && <p className="font-mono text-xs text-dim">Reference: {error.digest}</p>}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <button type="button" onClick={reset} className="inline-flex min-h-[48px] items-center rounded-control bg-ink px-5 font-semibold text-paper hover:bg-gray-6">Try again</button>
        <Link href="/" className="text-sm font-medium underline underline-offset-4 hover:text-scam">Back to overview</Link>
      </div>
    </main>
  );
}
