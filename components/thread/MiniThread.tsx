import { PinHead } from "./Pin";
import { money, shortDate } from "@/lib/format";

export type MiniThreadProps = { host: string; exposureAt: string; days: number; descriptor: string; amountCents: number; chargeAt: string };

/** The Thread, compact: used on rows where the linker really tied a charge to an exposure. */
export function MiniThread({ host, exposureAt, days, descriptor, amountCents, chargeAt }: MiniThreadProps) {
  return (
    <div className="grid items-start gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(90px,.8fr)_minmax(0,1fr)]">
      <div className="relative min-w-0 pr-3">
        <p className="eyebrow">Typed card on</p>
        <p className="truncate font-mono text-[14px] font-bold">{host}</p>
        <p className="font-mono text-xs text-dim">{shortDate(exposureAt)}</p>
        <PinHead color="var(--scam)" className="right-0 top-[14px] hidden -translate-y-1/2 translate-x-1/2 sm:block" />
      </div>
      <div className="relative h-10 sm:h-7">
        <svg aria-hidden viewBox="0 0 100 20" preserveAspectRatio="none" className="thread-twang absolute inset-x-0 top-1/2 hidden h-5 w-full -translate-y-1/2 sm:block">
          <path className="connector-line" d="M0 10 Q50 11.5 100 10" pathLength={100} stroke="var(--scam)" strokeWidth="2.25" strokeLinecap="round" fill="none" />
        </svg>
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-[2px] -translate-x-1/2 bg-scam sm:hidden" />
        <span className="eyebrow absolute left-1/2 top-1/2 -translate-x-1/2 whitespace-nowrap bg-surface px-1.5 text-scam sm:top-[20px] sm:translate-y-0 sm:bg-transparent sm:px-0">{days}d later</span>
      </div>
      <div className="relative min-w-0 pl-3 sm:text-right">
        <PinHead delayed color="var(--scam)" className="left-0 top-[14px] hidden -translate-x-1/2 -translate-y-1/2 sm:block" />
        <p className="eyebrow">Charge</p>
        <p className="truncate font-mono text-[14px] font-bold">{descriptor}</p>
        <p className="font-mono text-xs text-dim"><span className="text-fg">{money(amountCents)}</span> · {shortDate(chargeAt)}</p>
      </div>
    </div>
  );
}
