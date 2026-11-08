import Link from "next/link";
import { money, shortDate, longDateTime } from "@/lib/format";
import type { AttentionItem, Overview } from "@/lib/overview";
import { VERDICT_TEXT } from "@/lib/schemas";
import { Badge } from "../ui/Badge";
import { FlagBadge } from "../ui/FlagBadge";
import { ModeBadge } from "../ui/ModeBadge";
import { OpenPhoneButton } from "./OpenPhoneButton";
import { ChipDisc, type ChipTone } from "../table/chips";
import { CornerIndex } from "../table/PlayingCardFace";
import { Suit, type SuitKind } from "../table/Suit";

const H2 = "font-grotesk uppercase text-brass";
const PRIMARY = "btn-brass chip-btn inline-flex min-h-[52px] items-center gap-2 rounded-full px-6 text-[15px] transition duration-ui";
const EMPTY = "rounded-card border border-dashed brass-hairline p-5 text-sm text-dim";

export const HOME_SUBHEAD = "Every charge, checked against the website behind it. Bluff crawls the merchant's site and an NVIDIA Nemotron agent reads it like an investigator, then texts your T-Mobile phone and drafts the dispute.";

const STEPS: [string, string][] = [
  ["Capital One Nessie feed", "Your card's charges arrive from the Nessie sandbox API."],
  ["Crawl the merchant's site", "Refund, terms, contact and checkout pages, plus registry facts."],
  ["Nemotron reads it", "An NVIDIA Nemotron agent uses tools to review the pages and cites what it found."],
  ["T-Mobile text + dispute draft", "Risky charges are texted to your phone, with a dispute drafted for you to review."],
];

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "just now", "12 min ago", "3 h ago", "2 days ago"; "never" for null. */
export function relativeTime(iso: string | null, now = new Date()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return plural(Math.round(s / 86_400), "day") + " ago";
}

export function homeTitle(riskyCharges: number): string {
  if (!riskyCharges) return "Bluff watches your card.";
  return `${plural(riskyCharges, "charge")} on your card look${riskyCharges === 1 ? "s" : ""} risky.`;
}

/** Three cards fanned on the felt: scam, unsure, safe. Decorative; the headline carries the facts. */
function Fan() {
  const cards: { suit: SuitKind; rot: number; x: number; y: number; word: string }[] = [
    { suit: "scam", rot: -12, x: -84, y: 10, word: "Bluff" },
    { suit: "unsure", rot: 0, x: 0, y: -6, word: "Unsure" },
    { suit: "safe", rot: 12, x: 84, y: 10, word: "Legit" },
  ];
  return (
    <div aria-hidden className="relative mx-auto hidden h-[210px] w-[320px] shrink-0 md:block">
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

function Tile({ label, value, hint, alarm, chip }: { label: string; value: string; hint: string; alarm?: boolean; chip: ChipTone }) {
  return (
    <div className="shimmer stitch flex items-center gap-3 rounded-card border brass-hairline bg-surface p-4">
      <span className="relative z-10 hidden sm:block"><ChipDisc tone={alarm ? "scam" : chip} size={44} /></span>
      <div className="relative z-10 min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-dim">{label}</div>
        <div className={`num serif mt-1 text-3xl font-bold ${alarm ? "text-scam" : ""}`}>{value}</div>
        <div className="mt-0.5 text-xs leading-snug text-dim" title={hint}>{hint}</div>
      </div>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const row = "shimmer relative z-10 flex min-h-[60px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-white/[0.04]";
  if (item.kind === "rule") {
    return (
      <Link href={`/charges/${item.id}`} className={row}>
        <span className="num w-14 text-sm text-dim">{shortDate(item.ts)}</span>
        <span className="min-w-0 flex-1 truncate font-semibold">{item.descriptor}</span>
        <span className="num font-semibold">{money(item.amountCents)}</span>
        <span className="flex flex-wrap gap-1">{item.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
      </Link>
    );
  }
  return (
    <Link href={`/charges/${item.latestTxnId}`} className={row}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="serif truncate text-lg font-semibold">{item.merchant}</span>
          <Badge tone={item.label === "likely_scam" ? "scam" : "unsure"}>{VERDICT_TEXT[item.label]}</Badge>
          <ModeBadge mode={item.mode} />
          {item.flags.map((f) => <FlagBadge key={f} kind={f} />)}
        </span>
        {item.reason && <span className="text-sm text-dim">{item.reason}</span>}
      </span>
      <span className="text-right">
        <span className="num block">{money(item.totalCents)}</span>
        <span className="block text-xs text-dim">{plural(item.charges, "charge")} · last {shortDate(item.latestTs)}</span>
      </span>
    </Link>
  );
}

/** The home page: what Bluff found on your card, what it texted you, and where to go next. */
export function HomeView({ o, now = new Date() }: { o: Overview; now?: Date }) {
  const s = o.scan;
  const scanned = !!s.lastScanAt;
  const items = o.needsAttention.slice(0, 6);
  return (
    <div className="flex flex-col gap-8">
      {o.hold.held && (
        <p role="status" className="rounded-control border border-unsure/50 bg-unsure/10 px-4 py-2.5 text-sm">
          Safe Signal hold is on (simulated): new online charges are declined. Reply UNHOLD on your phone to release.
        </p>
      )}

      <header className="stitch flex items-center gap-6 rounded-card border brass-hairline bg-surface p-6 sm:p-8" style={{ background: "radial-gradient(ellipse 70% 120% at 20% 0%, rgba(40,120,86,.35), rgba(3,17,10,.5))" }}>
        <div className="relative z-10 flex flex-1 flex-col gap-3">
          <p className="inline-flex items-center gap-2 self-start rounded-full border brass-hairline bg-black/25 px-3 py-1 text-xs text-dim" title="Capital One Nessie sandbox account with synthetic charges">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-safe" /> {s.account ? `Capital One · ${s.account}` : "Capital One (Nessie sandbox)"}
          </p>
          <h1 className="text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl">{homeTitle(s.riskyCharges)}</h1>
          <p className="max-w-2xl text-dim">{HOME_SUBHEAD}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/scan" className={PRIMARY}>Scan my transactions</Link>
            <Link href="/check" className="text-sm font-semibold text-brass underline">Check a site before you buy</Link>
          </div>
        </div>
        <Fan />
      </header>

      <section aria-label="Your card at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile chip="brass" label="Charges watched" value={String(s.charges)} hint={s.charges ? `${plural(s.merchants, "merchant")} · last 45 days` : "Imported from Capital One on your first scan"} />
        <Tile chip="black" label="Likely scams" value={String(s.likelyScams)} hint={`${s.unsure} more unsure`} alarm={s.likelyScams > 0} />
        <Tile chip="black" label="Money at risk" value={money(s.atRiskCents)} hint="on flagged or unsure sites" alarm={s.atRiskCents > 0} />
        <Tile chip="blue" label="Last scan" value={relativeTime(s.lastScanAt, now)}
          hint={!scanned ? "Run your first scan" : !s.deepAvailable && !s.reviewedByNemotron ? "Basic check only (Nemotron off)" : `${s.reviewedByNemotron}/${plural(s.scannedMerchants, "site")} by Nemotron`} />
      </section>

      <section aria-labelledby="attention-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="attention-h" className={H2}>Needs attention</h2>
          <Link href="/charges" className="text-sm font-medium text-brass underline">See every charge</Link>
        </div>
        {!scanned && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed brass-hairline p-5">
            <p className="text-sm text-dim"><span className="font-semibold text-fg">No scan yet.</span> Bluff imports your Capital One charges and checks the website behind each one.</p>
            <Link href="/scan" className="text-sm font-semibold text-brass underline">Run your first scan</Link>
          </div>
        )}
        {items.length === 0 ? (scanned && <p className={EMPTY}>Nothing flagged. Every charge Bluff checked looks OK, and no rule fired in the last two weeks.</p>) : (
          <ul className="stitch divide-y divide-[rgba(217,180,107,0.16)] overflow-hidden rounded-card border brass-hairline bg-surface">
            {items.map((x) => <li key={x.kind === "scan" ? `scan:${x.key}` : x.id}><AttentionRow item={x} /></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-h" className="flex flex-col gap-3">
        <h2 id="how-h" className={H2}>How Bluff works</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card-face deal relative flex min-h-[132px] min-w-0 flex-col gap-1 rounded-[14px] py-4 pl-14 pr-4" style={{ ["--i" as string]: i }}>
              <CornerIndex rank={i + 1} suit={(["unsure", "scam", "safe", "unsure"] as SuitKind[])[i]} />
              <span className="serif text-lg font-bold leading-snug">{title}</span>
              <span className="text-sm leading-snug text-[#4d4128]">{text}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid gap-8 md:grid-cols-2">
        <section aria-labelledby="texts-h" className="flex flex-col gap-3">
          <h2 id="texts-h" className={H2}>Texts on your T-Mobile phone</h2>
          {o.alerts.length === 0 ? <p className={EMPTY}>No texts yet. Bluff texts you when a charge or a site you used looks risky.</p> : (
            <ul className="flex flex-col gap-2">
              {o.alerts.map((a) => (
                <li key={a.id} className="rounded-card border brass-hairline bg-surface p-3.5 text-sm leading-relaxed">
                  <p className="break-words">{a.body}</p>
                  <p className="mt-1 text-xs text-dim">{longDateTime(a.createdAt)}{a.status === "failed" && <span className="ml-2 text-scam">Text not delivered</span>}</p>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-dim">Read and reply on the phone preview (its button is at the top of the page). Delivery is in-app; no real SMS is sent.</p>
          <OpenPhoneButton />
        </section>

        <section aria-labelledby="sites-h" className="flex flex-col gap-3">
          <h2 id="sites-h" className={H2}>Before you pay</h2>
          <div className="stitch flex flex-col gap-2 rounded-card border brass-hairline bg-surface p-4 text-sm [&>*]:relative [&>*]:z-10">
            <p>Not sure about a store or a text? Bluff runs the same crawl and Nemotron review on demand.</p>
            <p className="text-dim">{plural(o.exposuresThisWeek, "site")} where you entered your card this week.</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/check" className="font-semibold text-brass underline">Check a site</Link>
              <Link href="/check#exposures" className="font-semibold text-brass underline">Sites you used your card on</Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-dashed brass-hairline pt-4 text-sm">
        <Link href="/eval" className="text-brass underline">Proof: how well it works</Link>
        <Link href="/extension" className="text-brass underline">Chrome extension</Link>
        <Link href="/privacy" className="text-brass underline">Privacy</Link>
      </footer>
    </div>
  );
}
