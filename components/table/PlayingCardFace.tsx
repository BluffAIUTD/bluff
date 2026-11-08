import type { ReactNode } from "react";
import { Suit, type SuitKind } from "./Suit";

/** Corner index: rank over suit. Decorative (the same facts are in the text). */
export function CornerIndex({ rank, suit, flip = false }: { rank: ReactNode; suit: SuitKind; flip?: boolean }) {
  return (
    <div aria-hidden className={`absolute flex flex-col items-center leading-none ${flip ? "bottom-3 right-3 rotate-180" : "left-3 top-3"}`}>
      <span className="num serif text-[26px] font-bold" style={{ color: "var(--card-ink)" }}>{rank}</span>
      <Suit kind={suit} className="mt-1 h-[18px] w-[18px]" />
    </div>
  );
}
