"use client";
import { ChipSide, type ChipTone } from "./chips";

export const CHIP_POINTS = 10;
export const MAX_CHIPS = 10;
const STEP0 = 9; // vertical offset between stacked chips, px (at scale 1)
const CHIP_W0 = 92;
const CHIP_H0 = 31;

/** Band of a chip by its lower bound, matching the verdict thresholds (under 40 scam, under 70 unsure, else ok). */
export function bandOf(points: number): ChipTone {
  return points < 40 ? "scam" : points < 70 ? "unsure" : "safe";
}

/**
 * The trust score as a stack of chips: one chip per 10 points, colored by risk band
 * (red under 40, amber 40 to 69, green from 70), the top chip in the verdict's own color.
 * Chips drop in one after another when `animate` is on (keyed by `replayKey` so a new verdict rebuilds it).
 */
export function ChipStack({ score, topTone, animate = true, replayKey, scale = 1, ghosts = true }: { score: number; topTone: ChipTone; animate?: boolean; replayKey?: string | number; scale?: number; ghosts?: boolean }) {
  const STEP = STEP0 * scale, CHIP_W = CHIP_W0 * scale, CHIP_H = CHIP_H0 * scale;
  const n = Math.max(score > 0 ? 1 : 0, Math.min(MAX_CHIPS, Math.ceil(score / CHIP_POINTS)));
  const height = CHIP_H + (MAX_CHIPS - 1) * STEP + 6 * scale;
  return (
    <div aria-hidden className="relative shrink-0" style={{ width: CHIP_W + 8 * scale, height }}>
      {/* table-top shadow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 rounded-[50%] bg-black/50 blur-[5px]" style={{ width: CHIP_W + 6 * scale, height: 12 * scale }} />
      {/* ghost slots: where the remaining chips would go, tinted by band */}
      {ghosts && Array.from({ length: MAX_CHIPS }, (_, i) => i).filter((i) => i >= n).map((i) => (
        <div key={`g${i}`} className="absolute left-1/2 -translate-x-1/2 rounded-[50%] border border-dashed" style={{
          width: CHIP_W - 6 * scale, height: 17 * scale, bottom: 12 * scale + i * STEP,
          borderColor: `rgb(var(--${bandOf(i * CHIP_POINTS)}-rgb) / 0.28)`,
        }} />
      ))}
      <div key={replayKey} className="absolute bottom-0" style={{ left: 4 * scale, right: 4 * scale }}>
        {Array.from({ length: n }, (_, i) => {
          const tone = i === n - 1 ? topTone : bandOf(i * CHIP_POINTS);
          return (
            <div key={i} className={`absolute left-0 ${animate ? "chip-drop" : ""}`} style={{ bottom: 4 * scale + i * STEP, width: CHIP_W, height: CHIP_H, ["--i" as string]: i, zIndex: i }}>
              <ChipSide tone={tone} className="h-full w-full drop-shadow-[0_2px_1px_rgba(0,0,0,0.45)]" />
            </div>
          );
        })}
      </div>
    </div>
  );
}
