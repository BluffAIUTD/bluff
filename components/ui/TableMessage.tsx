import type { ReactNode } from "react";
import { CornerIndex } from "../table/PlayingCardFace";
import { Suit, type SuitKind } from "../table/Suit";

/** Full-page message in the table style: one ivory card face up on the felt. Used by not-found, error and loading. */
export function TableMessage({ rank, suit = "unsure", title, message, actions }: { rank: string; suit?: SuitKind; title: string; message: string; actions?: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-10 text-center">
      <div className="card-face deal relative grid h-[250px] w-[178px] place-items-center rounded-[14px]">
        <span aria-hidden className="pointer-events-none absolute inset-[7px] rounded-[9px] border" style={{ borderColor: "rgba(120,90,30,0.28)" }} />
        <CornerIndex rank={rank} suit={suit} />
        <CornerIndex rank={rank} suit={suit} flip />
        <Suit kind={suit} className="h-20 w-20" />
      </div>
      <div className="flex flex-col gap-2">
        <h1 className="text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-5xl">{title}</h1>
        <p className="text-dim">{message}</p>
      </div>
      {actions && <div className="flex flex-wrap justify-center gap-3">{actions}</div>}
    </div>
  );
}
