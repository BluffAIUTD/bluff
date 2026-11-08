import { Badge } from "../ui/Badge";
import { PinHead } from "../thread/Pin";
import { FIELD_LABELS, longDateTime, money, shortDate } from "@/lib/format";

export type LinkInfo = {
  kind: "flagged" | "expected" | "possible" | "none";
  host?: string; exposureAt?: string; exposureScore?: number; fieldTypes?: string[]; reasons?: string[]; otherCount?: number; days?: number;
};

const STYLE = {
  flagged: { color: "var(--scam)", tag: "border-scam/60 text-fg", title: "Linked to a site where you entered info", badge: <Badge tone="scam">Exposure link</Badge>, width: 2.5 },
  expected: { color: "var(--safe)", tag: "border-safe/60 text-fg", title: "Expected charge", badge: <Badge tone="safe">Expected charge</Badge>, width: 2 },
  possible: { color: "var(--unsure)", tag: "border-unsure/60 text-fg", title: "Possible match, low confidence", badge: <Badge tone="unsure">Possible match</Badge>, width: 2 },
  none: { color: "var(--gray-4)", tag: "border-gray-3 text-dim", title: "No linked exposure", badge: <Badge>Not linked</Badge>, width: 2 },
} as const;

/**
 * "The Thread": a taut string drawn from the exposure pin (where you typed) to the charge pin (what posted), with the match
 * reasons hanging off it as tags. The string exists only when the linker found a real link; "none" shows a severed string.
 */
export function LinkedChargeCard({ link, charge, pending }: { link: LinkInfo; charge: { descriptor: string; amountCents: number; ts: string }; pending?: boolean }) {
  const s = STYLE[link.kind];
  const none = link.kind === "none";
  return (
    <section aria-label="Linked charge" className="dossier relative p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line pb-4">
        <span className="exhibit">Exhibits A and B</span>
        <h2 className="font-display text-xl sm:text-2xl">{s.title}</h2>
        {s.badge}
        {pending && <span className="text-xs text-dim">explanation loading…</span>}
      </div>

      <div className="grid items-start sm:grid-cols-[minmax(0,1fr)_minmax(150px,1.05fr)_minmax(0,1fr)]">
        {/* Exhibit A: the exposure */}
        <div className="relative z-0 border border-line bg-bg/60 p-4 sm:-rotate-[0.4deg]">
          <p className="eyebrow">You entered info on</p>
          {none ? (
            <p className="mt-2 text-sm text-dim">None of the sites in your Exposure Log explain this charge, so Bluff isn&apos;t linking it to anything.</p>
          ) : (
            <>
              <p className="mt-2 break-all font-mono text-[15px] font-bold">{link.host}</p>
              <p className="mt-0.5 font-mono text-xs text-dim">{link.exposureAt && longDateTime(link.exposureAt)}</p>
              <p className="mt-2 text-sm">Score <span className="num font-bold">{link.exposureScore}</span> · {(link.fieldTypes ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}</p>
            </>
          )}
          {!none && <PinHead color={s.color} className="left-1/2 top-full -translate-x-1/2 -translate-y-1/2 sm:left-full sm:top-[14px] sm:-translate-x-1/2" />}
        </div>

        {/* The string, with its tags */}
        <div className="relative flex flex-col items-center sm:min-h-[100px]">
          {none ? (
            <>
              <svg aria-hidden viewBox="0 0 100 28" preserveAspectRatio="none" className="hidden h-7 w-full sm:block">
                <path d="M0 14 H38" stroke="var(--gray-4)" strokeWidth="2" strokeDasharray="3 4" fill="none" />
                <path d="M62 14 H100" stroke="var(--gray-4)" strokeWidth="2" strokeDasharray="3 4" fill="none" />
                <path d="M44 8 L56 20 M56 8 L44 20" stroke="var(--gray-4)" strokeWidth="2" strokeLinecap="round" fill="none" />
              </svg>
              <span aria-hidden className="block h-8 w-px border-l-2 border-dashed border-gray-4 sm:hidden" />
            </>
          ) : (
            <>
              <svg aria-hidden viewBox="0 0 100 28" preserveAspectRatio="none" className="thread-twang hidden h-7 w-full sm:block">
                <path className="connector-line" d="M0 14 Q50 16.5 100 14" pathLength={100} stroke={s.color} strokeWidth={s.width} strokeLinecap="round" fill="none" />
              </svg>
              {link.days != null && (
                <span className="eyebrow absolute left-1/2 top-[14px] hidden -translate-x-1/2 -translate-y-[170%] whitespace-nowrap sm:block" style={{ color: s.color }}>{link.days} day{link.days === 1 ? "" : "s"}</span>
              )}
              <span aria-hidden className="thread-plumb absolute bottom-0 left-1/2 top-0 w-[2px] -translate-x-1/2 sm:top-[14px]" style={{ background: s.color }} />
            </>
          )}
          {link.reasons && link.reasons.length > 0 && (
            <ul aria-label="Why these match" className="relative z-10 flex w-full flex-col items-center gap-3 py-5 sm:pb-0 sm:pt-6">
              {link.reasons.map((r, i) => (
                <li key={r} className={`thread-tag max-w-[260px] border bg-surface px-3 py-1.5 text-center text-[13px] leading-snug shadow-sm ${s.tag}`} style={{ animationDelay: `${1100 + i * 140}ms` }}>{r}</li>
              ))}
            </ul>
          )}
          {!link.reasons?.length && <span className="block h-6 sm:h-0" />}
        </div>

        {/* Exhibit B: the charge */}
        <div className="relative z-0 border border-line bg-bg/60 p-4 sm:rotate-[0.4deg]">
          <p className="eyebrow">Charge{link.days != null ? ` · ${link.days} day${link.days === 1 ? "" : "s"} later` : ""}</p>
          <p className="mt-2 break-all font-mono text-[15px] font-bold">{charge.descriptor}</p>
          <p className="numeral mt-2 text-[40px] font-semibold">{money(charge.amountCents)}</p>
          <p className="mt-1 font-mono text-xs text-dim">{shortDate(charge.ts)}</p>
          {!none && <PinHead delayed color={s.color} className="left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 sm:left-0 sm:top-[14px] sm:-translate-y-1/2" />}
        </div>
      </div>

      {!!link.otherCount && <p className="mt-5 font-mono text-xs text-dim">{link.otherCount} other possible match{link.otherCount > 1 ? "es" : ""}</p>}
    </section>
  );
}
