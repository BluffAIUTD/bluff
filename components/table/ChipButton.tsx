import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ChipDisc, type ChipTone } from "./chips";

/** A labeled button with a chip on it. The text is the label; the chip is decoration. */
export function ChipButton({ tone = "brass", glyph, children, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: ChipTone; glyph?: ReactNode; children: ReactNode }) {
  return (
    <button
      type="button"
      {...rest}
      className={`chip-btn btn-rail group inline-flex min-h-[56px] items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 text-left text-[15px] font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      <ChipDisc tone={tone} size={44}>{glyph}</ChipDisc>
      <span>{children}</span>
    </button>
  );
}
