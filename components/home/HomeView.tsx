import Link from "next/link";
import { money, shortDate, longDateTime } from "@/lib/format";
import type { AttentionItem, Overview } from "@/lib/overview";
import { VERDICT_TEXT } from "@/lib/schemas";
import { Badge } from "../ui/Badge";
import { FlagBadge } from "../ui/FlagBadge";
import { ModeBadge } from "../ui/ModeBadge";
import { OpenPhoneButton } from "./OpenPhoneButton";

const H2 = "font-grotesk text-sm font-medium uppercase tracking-wide text-dim";
const PRIMARY = "inline-flex min-h-[48px] items-center rounded-control bg-accent px-5 font-semibold text-white transition duration-ui hover:brightness-110";
const EMPTY = "rounded-card border border-dashed border-line p-4 text-sm text-dim";

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

function Tile({ label, value, hint, alarm }: { label: string; value: string; hint: string; alarm?: boolean }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className={`num mt-1 font-grotesk text-2xl font-bold ${alarm ? "text-scam" : ""}`}>{value}</div>
      <div className="mt-0.5 truncate text-xs text-dim" title={hint}>{hint}</div>
    </div>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const row = "flex min-h-[56px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-surface2";
  if (item.kind === "rule") {
    return (
      <Link href={`/charges/${item.id}`} className={row}>
        <span className="num w-14 text-sm text-dim">{shortDate(item.ts)}</span>
        <span className="min-w-0 flex-1 truncate font-medium">{item.descriptor}</span>
        <span className="num">{money(item.amountCents)}</span>
        <span className="flex flex-wrap gap-1">{item.flags.map((f) => <FlagBadge key={f} kind={f} />)}</span>
      </Link>
    );
  }
  return (
    <Link href={`/charges/${item.latestTxnId}`} className={row}>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{item.merchant}</span>
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
        <p role="status" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">
          Safe Signal hold is on (simulated): new online charges are declined. Reply UNHOLD on your phone to release.
        </p>
      )}

      <header className="flex flex-col gap-2">
        <p className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-surface px-3 py-1 text-xs text-dim" title="Capital One Nessie sandbox account with synthetic charges">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-safe" /> {s.account ? `Capital One · ${s.account}` : "Capital One (Nessie sandbox)"}
        </p>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight sm:text-4xl">{homeTitle(s.riskyCharges)}</h1>
        <p className="max-w-2xl text-dim">{HOME_SUBHEAD}</p>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link href="/scan" className={PRIMARY}>Scan my transactions</Link>
          <Link href="/check" className="text-sm font-medium text-accent underline">Check a site before you buy</Link>
        </div>
      </header>

      <section aria-label="Your card at a glance" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Charges watched" value={String(s.charges)} hint={s.charges ? `${plural(s.merchants, "merchant")} · last 45 days` : "Imported from Capital One on your first scan"} />
        <Tile label="Likely scams" value={String(s.likelyScams)} hint={`${s.unsure} more unsure`} alarm={s.likelyScams > 0} />
        <Tile label="Money at risk" value={money(s.atRiskCents)} hint="on flagged or unsure sites" alarm={s.atRiskCents > 0} />
        <Tile label="Last scan" value={relativeTime(s.lastScanAt, now)}
          hint={!scanned ? "Run your first scan" : !s.deepAvailable && !s.reviewedByNemotron ? "Basic check only (Nemotron off)" : `${s.reviewedByNemotron}/${plural(s.scannedMerchants, "site")} by Nemotron`} />
      </section>

      <section aria-labelledby="attention-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="attention-h" className={H2}>Needs attention</h2>
          <Link href="/charges" className="text-sm text-accent underline">See every charge</Link>
        </div>
        {!scanned && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-dashed border-line p-4">
            <p className="text-sm text-dim"><span className="font-medium text-fg">No scan yet.</span> Bluff imports your Capital One charges and checks the website behind each one.</p>
            <Link href="/scan" className="text-sm font-semibold text-accent underline">Run your first scan</Link>
          </div>
        )}
        {items.length === 0 ? (scanned && <p className={EMPTY}>Nothing flagged. Every charge Bluff checked looks OK, and no rule fired in the last two weeks.</p>) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {items.map((x) => <li key={x.kind === "scan" ? `scan:${x.key}` : x.id}><AttentionRow item={x} /></li>)}
          </ul>
        )}
      </section>

      <section aria-labelledby="how-h" className="flex flex-col gap-3">
        <h2 id="how-h" className={H2}>How Bluff works</h2>
        <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-3">
              <span className="flex items-start gap-2">
                <span aria-hidden className="num grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent/20 text-xs font-bold text-fg">{i + 1}</span>
                <span className="text-sm font-semibold leading-snug">{title}</span>
              </span>
              <span className="text-xs text-dim">{text}</span>
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
                <li key={a.id} className="rounded-card border border-line bg-surface p-3 text-sm">
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
          <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-sm">
            <p>Not sure about a store or a text? Bluff runs the same crawl and Nemotron review on demand.</p>
            <p className="text-dim">{plural(o.exposuresThisWeek, "site")} where you entered your card this week.</p>
            <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
              <Link href="/check" className="font-medium text-accent underline">Check a site</Link>
              <Link href="/check#exposures" className="font-medium text-accent underline">Sites you used your card on</Link>
            </div>
          </div>
        </section>
      </div>

      <footer className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-4 text-sm">
        <Link href="/eval" className="text-accent underline">Proof: how well it works</Link>
        <Link href="/extension" className="text-accent underline">Chrome extension</Link>
        <Link href="/privacy" className="text-accent underline">Privacy</Link>
      </footer>
    </div>
  );
}
