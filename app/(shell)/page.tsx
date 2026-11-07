import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { loadOverview } from "@/lib/overview";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ScoreBadge } from "@/components/exposure/ScoreBadge";
import { money, shortDate, longDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Overview() {
  let o;
  try { o = await loadOverview(getPool(), MAYA_ID); }
  catch { return <ErrorState title="Couldn't load your overview" message="The database isn't reachable. Try again in a moment." />; }
  const n = o.needsAttention.length;
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-dim">Call their bluff.</p>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight sm:text-4xl">
          {o.exposuresThisWeek} exposure{o.exposuresThisWeek === 1 ? "" : "s"} this week, {n} charge{n === 1 ? "" : "s"} need{n === 1 ? "s" : ""} attention.
        </h1>
        <p className="max-w-xl text-dim">Bluff links the site where you typed your card to the charge that follows, then helps you get your money back.</p>
        <Link href="/check" className="mt-2 inline-flex min-h-[48px] items-center self-start rounded-control bg-accent px-5 font-semibold text-white transition duration-ui hover:brightness-110">Try Bluff on a store →</Link>
      </header>

      <section aria-label="Needs attention" className="flex flex-col gap-3">
        <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Needs attention</h2>
        {n === 0 ? <p className="rounded-card border border-dashed border-line p-4 text-sm text-dim">Nothing flagged in the last two weeks.</p> : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {o.needsAttention.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={`/charges/${t.id}`} className="flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface2">
                  <span className="num w-14 text-sm text-dim">{shortDate(t.ts)}</span>
                  <span className="flex-1 truncate font-medium">{t.descriptor}</span>
                  <span className="num">{money(t.amountCents)}</span>
                  <span className="flex flex-wrap gap-1">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-label="Latest exposures" className="flex flex-col gap-3">
          <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Latest exposures</h2>
          {o.latestExposures.length === 0 ? <p className="rounded-card border border-dashed border-line p-4 text-sm text-dim">None yet. <Link className="text-accent underline" href="/check">Check a store</Link> to start.</p> : (
            <ul className="flex flex-col gap-2">
              {o.latestExposures.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3">
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{e.host}</p><p className="text-xs text-dim">{longDateTime(e.createdAt)}</p></div>
                  <ScoreBadge score={e.score} />
                </li>
              ))}
            </ul>
          )}
          <Link href="/exposure" className="text-sm text-accent underline">See all exposures</Link>
        </section>

        <section aria-label="Alert feed" className="flex flex-col gap-3">
          <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Bluff Text alerts</h2>
          {o.alerts.length === 0 ? <p className="rounded-card border border-dashed border-line p-4 text-sm text-dim">No texts sent yet.</p> : (
            <ul className="flex flex-col gap-2">
              {o.alerts.map((a) => (
                <li key={a.id} className="rounded-card border border-line bg-surface p-3 text-sm">
                  <p>{a.kind === "call" && <span className="mr-2 text-xs font-semibold uppercase tracking-wide text-dim">Phone call</span>}{a.body}</p>
                  <p className="mt-1 text-xs text-dim">{longDateTime(a.createdAt)}{a.status === "failed" && <span className="ml-2 text-scam">Text not delivered</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
