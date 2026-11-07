"use client";
import { useEffect, useState } from "react";
import { toneFor } from "./tone";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Half-circle "chip" gauge. The number counts from 100 down/up to the score over 600 ms (instant with reduced motion). */
export function ScoreDial({ score, size = 168, animate = true }: { score: number; size?: number; animate?: boolean }) {
  const final = Math.max(0, Math.min(100, Math.round(score)));
  const [shown, setShown] = useState(animate && !prefersReducedMotion() ? 100 : final);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) { setShown(final); return; }
    let raf = 0;
    const t0 = performance.now();
    const from = 100;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 600);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(from + (final - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [final, animate]);

  const tone = toneFor(shown);
  return (
    <div role="img" aria-label={`Trust score ${final} out of 100`} className="relative" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 120 70" width={size} height={size * 0.58} aria-hidden>
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke="var(--gray-6)" strokeWidth="10" strokeLinecap="round" pathLength={100} />
        <path d="M10 62 A50 50 0 0 1 110 62" fill="none" stroke={tone.stroke} strokeWidth="10" strokeLinecap="round" pathLength={100} strokeDasharray={`${shown} 100`} />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className={`num text-4xl font-bold leading-none ${tone.text}`}>{shown}</span>
        <span className="block text-[11px] uppercase tracking-wide text-dim">Trust score</span>
      </div>
    </div>
  );
}
