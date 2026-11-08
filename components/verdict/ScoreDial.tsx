"use client";
import { useEffect, useState } from "react";
import { toneFor } from "./tone";

function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const SEGMENTS = 25;
const zoneColor = (v: number) => (v < 40 ? "var(--scam)" : v < 70 ? "var(--unsure)" : "var(--safe)");

/**
 * Segmented trust meter (25 segments, zones: risky < 40, unsure < 70, safe). The number and the lit segments climb to the
 * real score in ~700 ms (instant under reduced motion). Higher is safer.
 */
export function ScoreDial({ score, size = 168, animate = true }: { score: number; size?: number; animate?: boolean }) {
  const final = Math.max(0, Math.min(100, Math.round(score)));
  const [shown, setShown] = useState(animate && !prefersReducedMotion() ? 0 : final);

  useEffect(() => {
    if (!animate || prefersReducedMotion()) { setShown(final); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 800);
      setShown(Math.round(final * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [final, animate]);

  const tone = toneFor(shown);
  const lit = Math.ceil((shown / 100) * SEGMENTS);
  const big = size >= 140;
  return (
    <div role="img" aria-label={`Trust score ${final} out of 100`} className="flex flex-col gap-2" style={{ width: Math.min(size * 1.7, 320), maxWidth: "100%" }}>
      <div className="flex items-end justify-between">
        <span className="label">Trust score</span>
        <span className="mono text-[10px] text-dim">/100</span>
      </div>
      <span className={`num font-semibold leading-none tracking-tight ${tone.text}`} style={{ fontSize: big ? 56 : 34 }}>{shown}</span>
      <div aria-hidden className="flex gap-[3px]" style={{ height: big ? 22 : 14 }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const on = i < lit;
          const c = zoneColor(((i + 0.5) / SEGMENTS) * 100);
          return <span key={i} className="seg flex-1 rounded-[2px]" style={{ background: on ? c : "var(--surface-3)", boxShadow: on ? `0 0 8px -1px ${c}` : undefined, opacity: on ? 1 : 0.9 }} />;
        })}
      </div>
      <div aria-hidden className="mono flex text-[9.5px] uppercase tracking-wider text-dim">
        <span style={{ width: "40%" }}>risky</span><span style={{ width: "30%" }}>unsure</span><span>safe</span>
      </div>
    </div>
  );
}
