import { Badge } from "../ui/Badge";
import { FIELD_LABELS, longDateTime, money, shortDate } from "@/lib/format";

export type LinkInfo = {
  kind: "flagged" | "expected" | "possible" | "none";
  host?: string; exposureAt?: string; exposureScore?: number; fieldTypes?: string[]; reasons?: string[]; otherCount?: number; days?: number;
};

const STYLE = {
  flagged: { glow: "panel-glow-scam", c: "var(--scam)", text: "text-scam", title: "Linked to a site where you entered info", badge: <Badge tone="scam">Exposure link</Badge> },
  expected: { glow: "panel-glow-safe", c: "var(--safe)", text: "text-safe", title: "Expected charge", badge: <Badge tone="safe">Expected charge</Badge> },
  possible: { glow: "panel-glow-unsure", c: "var(--unsure)", text: "text-unsure", title: "Possible match, low confidence", badge: <Badge tone="unsure">Possible match</Badge> },
  none: { glow: "", c: "var(--gray-4)", text: "text-dim", title: "No linked exposure", badge: <Badge>Not linked</Badge> },
} as const;

/** Exposure and charge as two nodes on a timeline; a pulse travels the real link. The agent never invents a link: "none" says so plainly. */
export function LinkedChargeCard({ link, charge, pending }: { link: LinkInfo; charge: { descriptor: string; amountCents: number; ts: string }; pending?: boolean }) {
  const s = STYLE[link.kind];
  const dashed = link.kind === "possible";
  return (
    <section aria-label="Linked charge" className={`panel p-4 sm:p-6 ${s.glow}`}>
      <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="label">Link</span>
        <h2 className="text-lg font-semibold tracking-tight">{s.title}</h2>
        {s.badge}
        {pending && <span className="mono text-xs text-dim">explanation loading…</span>}
      </div>
      {link.kind === "none" ? (
        <p className="text-sm text-dim">None of the sites in your Exposure Log explain this charge, so Bluff isn&apos;t linking it to anything.</p>
      ) : (
        <div className="grid items-stretch gap-0 sm:grid-cols-[minmax(0,1fr)_minmax(110px,0.7fr)_minmax(0,1fr)]">
          <div className="rounded-control border border-line2 bg-bg/60 p-3">
            <p className="label flex items-center gap-2"><span className="h-2 w-2 rounded-full border-2" style={{ borderColor: s.c }} />Exposure · you entered info</p>
            <p className="mono mt-2 break-all text-[15px] font-medium">{link.host}</p>
            <p className="mono text-xs text-dim">{link.exposureAt && longDateTime(link.exposureAt)}</p>
            <p className="mt-2 text-sm">Score <span className="num font-semibold">{link.exposureScore}</span> <span className="text-dim">· {(link.fieldTypes ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}</span></p>
          </div>

          <div aria-hidden className="relative flex min-h-[56px] items-center justify-center sm:min-h-0">
            <div className="relative hidden h-[2px] w-full sm:block" style={{ background: dashed ? `repeating-linear-gradient(90deg, ${s.c} 0 6px, transparent 6px 12px)` : `linear-gradient(90deg, ${s.c}, ${s.c})`, opacity: 0.55 }}>
              <span className="travel-pulse travel-x absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: s.c, boxShadow: `0 0 14px 2px ${s.c}` }} />
            </div>
            <div className="relative h-full w-[2px] sm:hidden" style={{ background: dashed ? `repeating-linear-gradient(180deg, ${s.c} 0 6px, transparent 6px 12px)` : s.c, opacity: 0.55 }}>
              <span className="travel-pulse travel-y absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: s.c, boxShadow: `0 0 14px 2px ${s.c}` }} />
            </div>
            {link.days != null && (
              <span className={`mono absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-line2 bg-surface px-2 py-0.5 text-[11px] ${s.text} sm:-translate-y-[170%]`}>
                +{link.days} day{link.days === 1 ? "" : "s"}
              </span>
            )}
          </div>

          <div className="rounded-control border bg-bg/60 p-3" style={{ borderColor: `color-mix(in srgb, ${s.c} 45%, var(--border-strong))` }}>
            <p className="label flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: s.c, boxShadow: `0 0 8px ${s.c}` }} />Charge{link.days != null ? ` · ${link.days} day${link.days === 1 ? "" : "s"} later` : ""}</p>
            <p className="mono mt-2 break-all text-[15px] font-medium">{charge.descriptor}</p>
            <p className="num text-2xl font-semibold tracking-tight">{money(charge.amountCents)}</p>
            <p className="mono text-xs text-dim">{shortDate(charge.ts)}</p>
          </div>
        </div>
      )}
      {link.reasons && link.reasons.length > 0 && (
        <div className="mt-5">
          <p className="label mb-2">Why these match</p>
          <ul aria-label="Why these match" className="flex flex-wrap gap-2">
            {link.reasons.map((r) => <li key={r} className="mono rounded-full border border-line2 bg-surface2 px-2.5 py-1 text-[12px] text-gray-2">{r}</li>)}
          </ul>
        </div>
      )}
      {!!link.otherCount && <p className="mono mt-3 text-xs text-dim">{link.otherCount} other possible match{link.otherCount > 1 ? "es" : ""}</p>}
    </section>
  );
}
