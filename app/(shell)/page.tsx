import Link from "next/link";
import { getPool } from "@/lib/db";
import { MAYA_ID } from "@/lib/config";
import { loadOverview } from "@/lib/overview";
import { FlagBadge } from "@/components/ui/FlagBadge";
import { ErrorState } from "@/components/ui/ErrorState";
import { ScoreBadge } from "@/components/exposure/ScoreBadge";
import { CornerIndex } from "@/components/table/PlayingCardFace";
import { Suit, type SuitKind } from "@/components/table/Suit";
import { ChipDisc } from "@/components/table/chips";
import { money, shortDate, longDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";

/** Three cards fanned on the felt: scam, unsure, safe. Decorative; the headline carries the facts. */
function Fan() {
  const cards: { suit: SuitKind; rot: number; x: number; y: number; word: string }[] = [
    { suit: "scam", rot: -12, x: -64, y: 10, word: "Bluff" },
    { suit: "unsure", rot: 0, x: 0, y: -6, word: "Unsure" },
    { suit: "safe", rot: 12, x: 64, y: 10, word: "Legit" },
  ];
  return (
    <div aria-hidden className="relative mx-auto hidden h-[210px] w-[280px] shrink-0 md:block">
      {cards.map((c, i) => (
        <div key={c.suit} className="absolute left-1/2 top-4" style={{ transform: `translateX(calc(-50% + ${c.x}px)) translateY(${c.y}px) rotate(${c.rot}deg)`, zIndex: i === 1 ? 2 : 1 }}>
          <div className="card-face deal relative grid h-[170px] w-[118px] place-items-center rounded-[11px]" style={{ ["--i" as string]: i }}>
            <CornerIndex rank="" suit={c.suit} />
            <Suit kind={c.suit} className="h-12 w-12" />
            <span className="serif absolute bottom-3 text-sm font-bold text-[#4d4128]">{c.word}</span>
          </div>
        </div>
      ))}
      <div className="absolute -bottom-1 left-2"><ChipDisc tone="brass" size={40} /></div>
      <div className="absolute bottom-3 left-10"><ChipDisc tone="black" size={36} /></div>
    </div>
  );
}

function Section({ title, children, label }: { title: string; children: React.ReactNode; label: string }) {
  return (
    <section aria-label={label} className="flex flex-col gap-3">
      <h2 className="font-grotesk uppercase text-brass">{title}</h2>
      {children}
    </section>
  );
}

export default async function Overview() {
  let o;
  try { o = await loadOverview(getPool(), MAYA_ID); }
  catch { return <ErrorState title="Couldn't load your overview" message="The database isn't reachable. Try again in a moment." />; }
  const n = o.needsAttention.length;
  return (
    <div className="flex flex-col gap-10">
      <header className="stitch flex items-center gap-6 rounded-card border brass-hairline bg-surface p-6 sm:p-8" style={{ background: "radial-gradient(ellipse 70% 120% at 20% 0%, rgba(40,120,86,.35), rgba(3,17,10,.5))" }}>
        <div className="relative z-10 flex flex-1 flex-col gap-3">
          <p className="serif text-lg italic brass-text w-fit">Call their bluff.</p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">
            {o.exposuresThisWeek} exposure{o.exposuresThisWeek === 1 ? "" : "s"} this week, {n} charge{n === 1 ? "" : "s"} need{n === 1 ? "s" : ""} attention.
          </h1>
          <p className="max-w-xl text-dim">Bluff links the site where you typed your card to the charge that follows, then helps you get your money back.</p>
          <Link href="/check" className="btn-brass chip-btn mt-2 inline-flex min-h-[52px] items-center gap-2 self-start rounded-full px-6 text-[15px] transition duration-ui">Try Bluff on a store <span aria-hidden>→</span></Link>
        </div>
        <Fan />
      </header>

      <Section title="Needs attention" label="Needs attention">
        {n === 0 ? <p className="rounded-card border border-dashed brass-hairline p-5 text-sm text-dim">Nothing flagged in the last two weeks.</p> : (
          <ul className="stitch divide-y divide-[rgba(217,180,107,0.16)] overflow-hidden rounded-card border brass-hairline bg-surface">
            {o.needsAttention.slice(0, 5).map((t) => (
              <li key={t.id}>
                <Link href={`/charges/${t.id}`} className="shimmer relative z-10 flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-white/[0.04]">
                  <span className="num w-14 text-sm text-dim">{shortDate(t.ts)}</span>
                  <span className="min-w-0 flex-1 truncate font-semibold">{t.descriptor}</span>
                  <span className="num font-semibold">{money(t.amountCents)}</span>
                  <span className="flex flex-wrap gap-1">{t.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="Latest exposures" label="Latest exposures">
          {o.latestExposures.length === 0 ? <p className="rounded-card border border-dashed brass-hairline p-5 text-sm text-dim">None yet. <Link className="text-brass underline" href="/check">Check a store</Link> to start.</p> : (
            <ul className="flex flex-col gap-2.5">
              {o.latestExposures.map((e) => (
                <li key={e.id} className="shimmer flex items-center gap-3 rounded-card border brass-hairline bg-surface p-3.5">
                  <div className="relative z-10 min-w-0 flex-1"><p className="serif truncate text-lg font-semibold">{e.host}</p><p className="text-xs text-dim">{longDateTime(e.createdAt)}</p></div>
                  <span className="relative z-10"><ScoreBadge score={e.score} /></span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/exposure" className="text-sm font-medium text-brass underline">See all exposures</Link>
        </Section>
        <Section title="Alerts sent to your phone" label="Alert feed">
          {o.alerts.length === 0 ? <p className="rounded-card border border-dashed brass-hairline p-5 text-sm text-dim">No texts sent yet.</p> : (
            <ul className="flex flex-col gap-2.5">
              {o.alerts.map((a) => (
                <li key={a.id} className="rounded-card border brass-hairline bg-surface p-3.5 text-sm leading-relaxed">
                  <p>{a.kind === "call" && <span className="mr-2 text-xs font-bold uppercase tracking-wide text-brass">Phone call</span>}{a.body}</p>
                  <p className="mt-1 text-xs text-dim">{longDateTime(a.createdAt)}{a.status === "failed" && <span className="ml-2 text-[#ff9b90]">Text not delivered</span>}</p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
