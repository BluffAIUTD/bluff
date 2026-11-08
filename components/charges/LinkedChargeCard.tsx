import { Badge } from "../ui/Badge";
import { FIELD_LABELS, longDateTime, money, shortDate } from "@/lib/format";
import { CornerIndex } from "../table/PlayingCardFace";
import type { SuitKind } from "../table/Suit";
import { toneFor } from "../verdict/tone";

export type LinkInfo = {
  kind: "flagged" | "expected" | "possible" | "none";
  host?: string; exposureAt?: string; exposureScore?: number; fieldTypes?: string[]; reasons?: string[]; otherCount?: number; days?: number;
};

const STYLE = {
  flagged: { ring: "rgb(224 87 76 / 0.55)", title: "Linked to a site where you entered info", badge: <Badge tone="scam">Exposure link</Badge>, suit: "scam" as SuitKind },
  expected: { ring: "rgb(95 207 151 / 0.5)", title: "Expected charge", badge: <Badge tone="safe">Expected charge</Badge>, suit: "safe" as SuitKind },
  possible: { ring: "rgb(232 168 58 / 0.55)", title: "Possible match, low confidence", badge: <Badge tone="unsure">Possible match</Badge>, suit: "unsure" as SuitKind },
  none: { ring: "rgba(217,180,107,0.3)", title: "No linked exposure", badge: <Badge>Not linked</Badge>, suit: "unsure" as SuitKind },
} as const;

/** The gold line that links the two cards (draws itself in). Horizontal beside cards, vertical when they stack. */
function GoldLink() {
  return (
    <>
      <svg aria-hidden viewBox="0 0 120 24" className="mx-auto hidden h-6 w-28 sm:block">
        <defs><linearGradient id="gold-h" gradientUnits="userSpaceOnUse" x1="6" x2="114" y1="0" y2="0"><stop offset="0" stopColor="#a47b33" /><stop offset=".5" stopColor="#f1d894" /><stop offset="1" stopColor="#a47b33" /></linearGradient></defs>
        <path className="connector-line" d="M6 12 H114" pathLength={100} stroke="url(#gold-h)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="6" cy="12" r="4" fill="#f1d894" stroke="#6e4d14" /><circle cx="114" cy="12" r="4" fill="#f1d894" stroke="#6e4d14" />
      </svg>
      <svg aria-hidden viewBox="0 0 24 64" className="mx-auto h-14 w-6 sm:hidden">
        <defs><linearGradient id="gold-v" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1="4" y2="60"><stop offset="0" stopColor="#a47b33" /><stop offset=".5" stopColor="#f1d894" /><stop offset="1" stopColor="#a47b33" /></linearGradient></defs>
        <path className="connector-line" d="M12 4 V60" pathLength={100} stroke="url(#gold-v)" strokeWidth="2" strokeLinecap="round" fill="none" />
        <circle cx="12" cy="4" r="4" fill="#f1d894" stroke="#6e4d14" /><circle cx="12" cy="60" r="4" fill="#f1d894" stroke="#6e4d14" />
      </svg>
    </>
  );
}

/** Exposure ↔ charge (hero moment 2): the two cards laid across the table, linked by a gold line. The agent never invents a link: "none" says so plainly. */
export function LinkedChargeCard({ link, charge, pending }: { link: LinkInfo; charge: { descriptor: string; amountCents: number; ts: string }; pending?: boolean }) {
  const s = STYLE[link.kind];
  const exposureSuit: SuitKind = link.exposureScore != null ? toneFor(link.exposureScore).suit : "unsure";
  return (
    <section aria-label="Linked charge" className="stitch rounded-card border bg-surface p-4 sm:p-6" style={{ borderColor: s.ring }}>
      <div className="relative z-10 mb-5 flex flex-wrap items-center gap-2.5">
        <h2 className="text-xl font-semibold">{s.title}</h2>
        {s.badge}
        {pending && <span className="text-xs text-dim">explanation loading…</span>}
      </div>
      {link.kind === "none" ? (
        <p className="relative z-10 text-sm text-dim">None of the sites in your Exposure Log explain this charge, so Bluff isn&apos;t linking it to anything.</p>
      ) : (
        <div className="relative z-10 grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-4">
          <div className="card-face deal relative mx-auto min-h-[170px] w-full max-w-[300px] rounded-[14px] px-5 py-5 pl-14 sm:mx-0 sm:justify-self-end" style={{ ["--i" as string]: 0 }}>
            <CornerIndex rank="" suit={exposureSuit} />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6a5a36]">You entered info on</p>
            <p className="serif mt-1 break-words text-xl font-bold leading-tight">{link.host}</p>
            <p className="mt-1 text-sm text-[#5a4c2e]">{link.exposureAt && longDateTime(link.exposureAt)}</p>
            <p className="mt-2 text-sm text-[#3a301c]">Score <span className="num font-bold">{link.exposureScore}</span> · {(link.fieldTypes ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}</p>
          </div>
          <GoldLink />
          <div className="card-face deal relative mx-auto min-h-[170px] w-full max-w-[300px] rounded-[14px] px-5 py-5 pl-14 sm:mx-0 sm:justify-self-start" style={{ ["--i" as string]: 1 }}>
            <CornerIndex rank="" suit={s.suit} />
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#6a5a36]">Charge{link.days != null ? ` · ${link.days} day${link.days === 1 ? "" : "s"} later` : ""}</p>
            <p className="serif mt-1 break-words text-xl font-bold leading-tight">{charge.descriptor}</p>
            <p className="num mt-1 text-2xl font-bold">{money(charge.amountCents)}</p>
            <p className="text-sm text-[#5a4c2e]">{shortDate(charge.ts)}</p>
          </div>
        </div>
      )}
      {link.reasons && link.reasons.length > 0 && (
        <ul aria-label="Why these match" className="relative z-10 mt-5 flex flex-wrap gap-2">
          {link.reasons.map((r) => (
            <li key={r} className="inline-flex items-center gap-2 rounded-full border border-dashed border-accent/60 bg-black/30 py-1 pl-2.5 pr-3 text-[13px]">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-accent" />{r}
            </li>
          ))}
        </ul>
      )}
      {!!link.otherCount && <p className="relative z-10 mt-3 text-xs text-dim">{link.otherCount} other possible match{link.otherCount > 1 ? "es" : ""}</p>}
    </section>
  );
}
