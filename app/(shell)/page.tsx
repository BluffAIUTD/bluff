import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { loadOverview } from "@/lib/overview";
import { listExposures } from "@/lib/exposures";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { Tile } from "@/components/ui/Panel";
import { ScoreBadge } from "@/components/exposure/ScoreBadge";
import { RadarSweep } from "@/components/shell/RadarSweep";
import { Icon } from "@/components/shell/Icon";
import { OverviewActions } from "@/components/shell/OverviewActions";
import { money, shortDate, longDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

function Stat({ label, value, sub, tone }: { label: string; value: number | string; sub: string; tone?: "scam" | "safe" | "unsure" }) {
  const c = tone === "scam" ? "text-scam" : tone === "safe" ? "text-safe" : tone === "unsure" ? "text-unsure" : "text-fg";
  return (
    <Tile label={label} className="justify-between" tone={tone === "scam" ? "scam" : undefined}>
      <p className={`num text-5xl font-semibold leading-none tracking-tight ${c}`}>{value}</p>
      <p className="mono text-xs text-dim">{sub}</p>
    </Tile>
  );
}

export default async function Overview() {
  let o, watching = 0, total = 0;
  try {
    const pool = getPool();
    o = await loadOverview(pool, MAYA_ID);
    const all = await listExposures(pool, MAYA_ID);
    total = all.length; watching = all.filter((e) => e.watch).length;
  } catch { return <ErrorState title="Couldn't load your overview" message="The database isn't reachable. Try again in a moment." />; }
  const n = o.needsAttention.length;
  const exposed = o.exposuresThisWeek;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-6">
        <section aria-label="Status" className={`panel relative overflow-hidden p-5 sm:p-6 md:col-span-4 ${n ? "panel-glow-scam" : "panel-glow-safe"}`}>
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 opacity-60 sm:-right-6 sm:-top-6">
            <RadarSweep state={n ? "scanning" : "done"} tone={n ? "scam" : "safe"} size={220} pings={Math.min(total, 6)} />
          </div>
          <p className="label relative">Call their bluff</p>
          <h1 className="relative mt-3 max-w-[22ch] text-3xl font-semibold leading-[1.1] tracking-tight sm:text-4xl">
            {exposed} exposure{exposed === 1 ? "" : "s"} this week, {n} charge{n === 1 ? "" : "s"} need{n === 1 ? "s" : ""} attention.
          </h1>
          <p className="relative mt-3 max-w-md text-sm leading-relaxed text-dim">Bluff links the site where you typed your card to the charge that follows, then helps you get your money back.</p>
          <OverviewActions />
        </section>

        <div className="grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-1">
          <Stat label="Need attention" value={n} sub="flagged, last 14 days" tone={n ? "scam" : "safe"} />
          <Stat label="Watching" value={watching} sub={`of ${total} logged exposure${total === 1 ? "" : "s"}`} tone={watching ? "safe" : undefined} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Tile label="Needs attention" ariaLabel="Needs attention" className="md:col-span-4" right={<Link href="/charges?f=flagged" className="mono text-[11px] text-dim hover:text-fg">all flagged →</Link>}>
          {n === 0 ? <p className="rounded-control border border-dashed border-line2 p-4 text-sm text-dim">Nothing flagged in the last two weeks.</p> : (
            <ul className="-mx-2 flex flex-col divide-y divide-line">
              {o.needsAttention.slice(0, 5).map((t) => (
                <li key={t.id}>
                  <Link href={`/charges/${t.id}`} className="group flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 rounded-control px-2 py-3 transition duration-ui hover:bg-surface2">
                    <span className="mono w-14 text-xs text-dim">{shortDate(t.ts)}</span>
                    <span className="mono min-w-0 flex-1 truncate text-sm">{t.descriptor}</span>
                    <span className="num text-sm font-medium">{money(t.amountCents)}</span>
                    <span className="flex flex-wrap gap-1">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
                    <Icon name="chevron" className="hidden h-4 w-4 text-gray-4 transition group-hover:translate-x-0.5 group-hover:text-fg sm:block" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile label="Latest exposures" ariaLabel="Latest exposures" className="md:col-span-2" right={<Link href="/exposure" className="mono text-[11px] text-dim hover:text-fg">all →</Link>}>
          {o.latestExposures.length === 0 ? <p className="rounded-control border border-dashed border-line2 p-4 text-sm text-dim">None yet. <Link className="text-accent underline underline-offset-4" href="/check">Check a store</Link> to start.</p> : (
            <ul className="flex flex-col gap-2">
              {o.latestExposures.map((e) => (
                <li key={e.id} className="flex items-center gap-3 rounded-control border border-line bg-bg/50 p-3">
                  <div className="min-w-0 flex-1"><p className="mono truncate text-sm">{e.host}</p><p className="mono text-[11px] text-dim">{longDateTime(e.createdAt)}</p></div>
                  <ScoreBadge score={e.score} />
                </li>
              ))}
            </ul>
          )}
        </Tile>
      </div>

      <div className="grid gap-4 md:grid-cols-6">
        <Tile label="Alerts sent to your phone" ariaLabel="Alert feed" className="md:col-span-4">
          {o.alerts.length === 0 ? <p className="rounded-control border border-dashed border-line2 p-4 text-sm text-dim">No texts sent yet.</p> : (
            <ul className="flex flex-col gap-2">
              {o.alerts.map((a) => (
                <li key={a.id} className="rounded-control border border-line bg-bg/50 p-3 text-sm">
                  <p>{a.kind === "call" && <span className="label mr-2">Phone call</span>}{a.body}</p>
                  <p className="mono mt-1 text-[11px] text-dim">{longDateTime(a.createdAt)}{a.status === "failed" && <span className="ml-2 text-scam">Text not delivered</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </Tile>

        <Tile label="Privacy" ariaLabel="Privacy summary" className="md:col-span-2">
          <ul className="mono flex flex-col gap-2 text-[12px]">
            <li className="flex justify-between gap-2"><span className="text-gray-2">card, CVV, passwords</span><span className="text-safe">never sent</span></li>
            <li className="flex justify-between gap-2"><span className="text-gray-2">page text</span><span className="text-safe">never sent</span></li>
            <li className="flex justify-between gap-2"><span className="text-gray-2">domain, field types</span><span className="text-unsure">sent</span></li>
          </ul>
          <Link href="/privacy#sent" className="mono mt-auto inline-flex items-center gap-2 text-[12px] text-gray-2 hover:text-fg">What leaves your device <Icon name="arrow" className="h-3.5 w-3.5" /></Link>
        </Tile>
      </div>
    </div>
  );
}
