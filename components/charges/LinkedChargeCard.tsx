import { Badge } from "../ui/Badge";
import { FIELD_LABELS, longDateTime, money, shortDate } from "@/lib/format";

export type LinkInfo = {
  kind: "flagged" | "expected" | "possible" | "none";
  host?: string; exposureAt?: string; exposureScore?: number; fieldTypes?: string[]; reasons?: string[]; otherCount?: number; days?: number;
};

const STYLE = {
  flagged: { ring: "border-scam/50 bg-scam/10", line: "var(--scam)", title: "Linked to a site where you entered info", badge: <Badge tone="scam">Exposure link</Badge> },
  expected: { ring: "border-safe/50 bg-safe/10", line: "var(--safe)", title: "Expected charge", badge: <Badge tone="safe">Expected charge</Badge> },
  possible: { ring: "border-unsure/50 bg-unsure/10", line: "var(--unsure)", title: "Possible match, low confidence", badge: <Badge tone="unsure">Possible match</Badge> },
  none: { ring: "border-line bg-surface", line: "var(--gray-4)", title: "No linked exposure", badge: <Badge>Not linked</Badge> },
} as const;

/** Exposure ↔ charge connector (hero moment 2). The agent never invents a link: "none" says so plainly. */
export function LinkedChargeCard({ link, charge, pending }: { link: LinkInfo; charge: { descriptor: string; amountCents: number; ts: string }; pending?: boolean }) {
  const s = STYLE[link.kind];
  return (
    <section aria-label="Linked charge" className={`rounded-card border p-4 sm:p-6 ${s.ring}`}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h2 className="font-grotesk text-lg font-bold">{s.title}</h2>
        {s.badge}
        {pending && <span className="text-xs text-dim">explanation loading…</span>}
      </div>
      {link.kind === "none" ? (
        <p className="text-sm text-dim">None of the sites in your Exposure Log explain this charge, so Bluff isn&apos;t linking it to anything.</p>
      ) : (
        <div className="grid items-center gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <div className="rounded-control bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-dim">You entered info on</p>
            <p className="font-medium">{link.host}</p>
            <p className="text-sm text-dim">{link.exposureAt && longDateTime(link.exposureAt)}</p>
            <p className="mt-1 text-sm">Score <span className="num font-bold">{link.exposureScore}</span> · {(link.fieldTypes ?? []).map((f) => FIELD_LABELS[f] ?? f).join(", ")}</p>
          </div>
          <svg aria-hidden viewBox="0 0 80 24" className="mx-auto my-5 h-6 w-20 rotate-90 sm:my-0 sm:rotate-0">
            <path className="connector-line" d="M2 12 H78" pathLength={100} stroke={s.line} strokeWidth="3" strokeLinecap="round" fill="none" />
            <circle cx="78" cy="12" r="3.5" fill={s.line} />
          </svg>
          <div className="rounded-control bg-surface p-3">
            <p className="text-xs uppercase tracking-wide text-dim">Charge{link.days != null ? ` · ${link.days} day${link.days === 1 ? "" : "s"} later` : ""}</p>
            <p className="font-medium">{charge.descriptor}</p>
            <p className="num text-lg font-bold">{money(charge.amountCents)}</p>
            <p className="text-sm text-dim">{shortDate(charge.ts)}</p>
          </div>
        </div>
      )}
      {link.reasons && link.reasons.length > 0 && (
        <ul aria-label="Why these match" className="mt-4 flex flex-col gap-1 text-sm">
          {link.reasons.map((r) => <li key={r} className="flex gap-2"><span aria-hidden>•</span>{r}</li>)}
        </ul>
      )}
      {!!link.otherCount && <p className="mt-2 text-xs text-dim">{link.otherCount} other possible match{link.otherCount > 1 ? "es" : ""}</p>}
    </section>
  );
}
