import Link from "next/link";

export const metadata = { title: "Page not found" };

/** Same dossier language as the app: a missing page is a missing file. */
export default function NotFound() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <p className="eyebrow">Case file / error 404</p>
      <h1 className="font-display text-[44px] font-semibold leading-[1.02] tracking-tight sm:text-6xl">No such page in the file<span className="text-scam">.</span></h1>
      <p className="max-w-xl text-lg leading-relaxed text-dim">That address does not match any page or charge. It may have been deleted when the demo was reset.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <Link href="/" className="inline-flex min-h-[48px] items-center rounded-control bg-ink px-5 font-semibold text-paper hover:bg-gray-6">Back to overview</Link>
        <Link href="/charges" className="text-sm font-medium underline underline-offset-4 hover:text-scam">See your charges</Link>
      </div>
      <p className="rule-top pt-4 font-display text-lg italic text-dim">Bluff drafts. You decide.</p>
    </main>
  );
}
