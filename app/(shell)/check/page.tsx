import Link from "next/link";
import { getPool } from "@/lib/db";
import { currentUserId } from "@/lib/server/currentUser";
import { listExposures } from "@/lib/exposures";
import type { ExposureDto } from "@/lib/types";
import { CheckClient } from "@/components/check/CheckClient";
import { ExposureTimeline } from "@/components/exposure/ExposureTimeline";
import { ErrorState } from "@/components/ui/ErrorState";
import { Icon } from "@/components/shell/Icon";

export const metadata = { title: "Check a site" };
export const dynamic = "force-dynamic";

export default async function CheckPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  // The Exposure Log, shown under the checker. Keyed by its rows below so a refresh after logging a new site shows it.
  let rows: ExposureDto[] | null = null;
  try { rows = await listExposures(getPool(), await currentUserId()); } catch { rows = null; }
  return (
    <div className="flex flex-col gap-12">
      <CheckClient initialStore={store} />

      <Link href="/extension" className="shimmer stitch flex items-center gap-3 rounded-card border brass-hairline bg-surface p-4 text-sm transition duration-ui hover:bg-white/[0.04] [&>*]:relative [&>*]:z-10">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-accent/60 bg-black/30 text-brass"><Icon name="shield" /></span>
        <span className="min-w-0 flex-1"><span className="font-semibold">Checkout Guard for Chrome:</span> <span className="text-dim">checks automatically when a page asks for your card.</span></span>
        <span aria-hidden className="text-brass">→</span>
      </Link>

      <section id="exposures" aria-labelledby="exposures-h" className="flex scroll-mt-24 flex-col gap-3">
        <div>
          <h2 id="exposures-h" className="font-sans text-lg font-bold tracking-tight">Sites you used your card on</h2>
          <p className="text-sm text-dim">Sites where you told Bluff you entered your card or personal info, so a later charge can be linked back. Bluff keeps the site&apos;s address and which kinds of fields it asked for, never what you typed.</p>
        </div>
        {rows === null ? <ErrorState title="Couldn't load your sites" message="The database isn't reachable. Try again in a moment." />
          : rows.length === 0 ? <p className="rounded-card border border-dashed brass-hairline p-5 text-sm text-dim">None yet. Check a store above and choose <span className="text-fg">Continue</span> if you enter your card there.</p>
          : <ExposureTimeline key={rows.map((r) => r.id).join(",")} initial={JSON.parse(JSON.stringify(rows))} />}
      </section>
    </div>
  );
}
