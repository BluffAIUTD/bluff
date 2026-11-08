"use client";
import { useEffect, useState } from "react";
import { ChipStack, MAX_CHIPS } from "../table/ChipStack";
import { toneFor } from "./tone";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The trust score as a chip stack (kept under its old name so callers and tests keep working).
 * Chips drop in one by one; the number counts up in step. Instant with reduced motion or `animate={false}`.
 */
export function ScoreDial({ score, animate = true, scale = 1 }: { score: number; size?: number; animate?: boolean; scale?: number }) {
  const final = Math.max(0, Math.min(100, Math.round(score)));
  const still = !animate || prefersReducedMotion();
  const [shown, setShown] = useState(still ? final : 0);
  useEffect(() => {
    if (still) { setShown(final); return; }
    let raf = 0;
    const chips = Math.min(MAX_CHIPS, Math.ceil(final / 10));
    const dur = 250 + chips * 85 + 500;
    const t0 = performance.now() + 120;
    const tick = (now: number) => {
      const p = Math.max(0, Math.min(1, (now - t0) / dur));
      setShown(Math.round(final * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [final, still]);
  const tone = toneFor(final);
  return (
    <div role="img" aria-label={`Trust score ${final} out of 100`} className="flex items-end gap-4">
      <ChipStack score={final} topTone={tone.chip} animate={!still} replayKey={final} scale={scale} />
      <div className="pb-1">
        <span className={`num block font-bold leading-none ${tone.text}`} style={{ fontSize: 56 * Math.max(scale, 0.6) }}>{shown}</span>
        <span className="mt-1 block text-[11px] font-bold uppercase tracking-[0.16em] text-dim">Trust score <span className="font-medium normal-case tracking-normal">of 100</span></span>
      </div>
    </div>
  );
}
