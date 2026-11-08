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
  const w = Math.round(size * 1.35);
  const x = shown * 2;
  return (
    <div role="img" aria-label={`Trust score ${final} out of 100`} className="flex flex-col gap-2" style={{ width: w }}>
      <span className="eyebrow" aria-hidden>Trust score</span>
      <div className="flex items-end gap-1.5" aria-hidden>
        <span className={`numeral font-semibold ${tone.text}`} style={{ fontSize: Math.round(size * 0.56) }}>{shown}</span>
        <span className="num pb-1 text-xs text-dim">/100</span>
      </div>
      <svg viewBox="0 0 200 26" width="100%" aria-hidden className="overflow-visible">
        <rect x="0" y="12" width="78" height="4" fill="var(--scam)" opacity=".55" />
        <rect x="80" y="12" width="58" height="4" fill="var(--unsure)" opacity=".55" />
        <rect x="140" y="12" width="60" height="4" fill="var(--safe)" opacity=".55" />
        {[0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((t) => <line key={t} x1={t * 2} x2={t * 2} y1="18" y2={t % 50 === 0 ? 24 : 21} stroke="var(--ink)" strokeWidth="1" />)}
        <path d={`M${x - 5} 0 L${x + 5} 0 L${x} 9 Z`} fill="var(--ink)" />
        <line x1={x} x2={x} y1="9" y2="16" stroke="var(--ink)" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
