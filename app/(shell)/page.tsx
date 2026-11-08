import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { loadOverview } from "@/lib/overview";
import { getTransactionDetail } from "@/lib/transactions";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ScoreBadge } from "@/components/exposure/ScoreBadge";
import { MiniThread } from "@/components/thread/MiniThread";
import { money, shortDate, longDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

const empty = "border border-dashed border-gray-3 p-4 text-sm text-dim";

export default async function Overview() {
  let o;
  try { o = await loadOverview(getPool(), MAYA_ID); }
  catch { return <ErrorState title="Couldn't load your overview" message="The database isn't reachable. Try again in a moment." />; }
  const n = o.needsAttention.length;
  const shownRows = o.needsAttention.slice(0, 5);
  // For charges the linker tied to an exposure, fetch the real link so the Thread can be drawn from it.
  const links = await Promise.all(shownRows.map(async (t) => {
    if (!t.flags.includes("exposure_link")) return null;
    try { const d = await getTransactionDetail(getPool(), MAYA_ID, t.id); return d?.best?.kind === "flagged" ? d.best : null; } catch { return null; }
  }));
  return (
    <div className="grid gap-x-12 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-12">
        <header className="flex flex-col gap-4">
          <p className="eyebrow">Briefing · Call their bluff</p>
          <h1 className="font-display text-[40px] font-semibold leading-[1.02] tracking-tight sm:text-6xl">
            <span className="text-scam">{o.exposuresThisWeek}</span> exposure{o.exposuresThisWeek === 1 ? "" : "s"} this week, <span className="text-scam">{n}</span> charge{n === 1 ? "" : "s"} need{n === 1 ? "s" : ""} attention.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-dim">Bluff links the site where you typed your card to the charge that follows, then helps you get your money back.</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/check" className="inline-flex min-h-[48px] items-center rounded-control bg-ink px-5 font-semibold text-paper transition duration-ui hover:bg-gray-6">Try Bluff on a store →</Link>
            <Link href="/scan" className="text-sm font-medium underline underline-offset-4 hover:text-scam">or scan your transactions</Link>
          </div>
        </header>

        <section aria-label="Needs attention" className="flex flex-col gap-4">
          <div className="rule-top flex items-baseline justify-between pt-3">
            <h2 className="eyebrow">Needs attention</h2>
            <span className="folio text-dim">{n} open</span>
          </div>
          {n === 0 ? <p className={empty}>Nothing flagged in the last two weeks.</p> : (
            <ul className="dossier divide-y divide-line">
              {shownRows.map((t, i) => {
                const l = links[i];
                return (
                  <li key={t.id}>
                    <Link href={`/charges/${t.id}`} className="block px-4 py-4 transition duration-ui hover:bg-surface2/60 sm:px-5">
                      {l ? (
                        <>
                          <MiniThread host={l.host} exposureAt={l.exposureAt} days={l.days} descriptor={t.descriptor} amountCents={t.amountCents} chargeAt={t.ts} />
                          <span className="mt-3 flex flex-wrap items-center gap-1.5">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}<span className="ml-auto font-mono text-xs text-dim">Open the case →</span></span>
                        </>
                      ) : (
                        <span className="flex min-h-[44px] flex-wrap items-center gap-x-4 gap-y-1">
                          <span className="num w-14 text-sm text-dim">{shortDate(t.ts)}</span>
                          <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-bold">{t.descriptor}</span>
                          <span className="num">{money(t.amountCents)}</span>
                          <span className="flex flex-wrap gap-1">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Latest exposures" className="flex flex-col gap-4">
          <div className="rule-top flex items-baseline justify-between pt-3">
            <h2 className="eyebrow">Latest exposures</h2>
            <Link href="/exposure" className="text-sm underline underline-offset-4 hover:text-scam">See all exposures</Link>
          </div>
          {o.latestExposures.length === 0 ? <p className={empty}>None yet. <Link className="text-accent underline" href="/check">Check a store</Link> to start.</p> : (
            <ul className="dossier divide-y divide-line">
              {o.latestExposures.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0 flex-1"><p className="truncate font-mono text-[14px] font-bold">{e.host}</p><p className="font-mono text-xs text-dim">{longDateTime(e.createdAt)}</p></div>
                  <ScoreBadge score={e.score} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside aria-label="Marginalia" className="flex flex-col gap-10 lg:border-l lg:border-line lg:pl-8">
        <section aria-label="Alert feed" className="flex flex-col gap-4">
          <div className="rule-top pt-3"><h2 className="eyebrow">Alerts sent to your phone</h2></div>
          {o.alerts.length === 0 ? <p className={empty}>No texts sent yet.</p> : (
            <ul className="flex flex-col gap-4">
              {o.alerts.map((a) => (
                <li key={a.id} className="border-l-2 border-scam pl-3 text-sm">
                  <p className="leading-snug">{a.kind === "call" && <span className="eyebrow mr-2">Phone call</span>}{a.body}</p>
                  <p className="mt-1 font-mono text-xs text-dim">{longDateTime(a.createdAt)}{a.status === "failed" && <span className="ml-2 text-scam">Text not delivered</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="How Bluff works" className="flex flex-col gap-3">
          <div className="rule-top pt-3"><h2 className="eyebrow">How a case is built</h2></div>
          <ol className="flex flex-col gap-3 text-sm text-dim">
            <li><span className="font-medium text-fg">Check.</span> Bluff reads a site before you hand over your card.</li>
            <li><span className="font-medium text-fg">Log.</span> If you go ahead, it keeps the domain and field types. Never what you typed.</li>
            <li><span className="font-medium text-fg">Link.</span> When a charge posts, a thread is tied back to that site.</li>
          </ol>
        </section>
      </aside>
    </div>
  );
}
