"use client";
import { useEffect, useState, type ReactNode } from "react";

/** 3D flip between two faces. `flipped` shows the back-side child. Both faces share one grid cell so height is the taller. */
export function FlipCard({ flipped, front, back, className = "" }: { flipped: boolean; front: ReactNode; back: ReactNode; className?: string }) {
  return (
    <div className={`flip-scene ${className}`}>
      <div className="flip-card" data-flipped={flipped}>
        <div className="flip-face">{front}</div>
        <div className="flip-face back-side">{back}</div>
      </div>
    </div>
  );
}

/** Returns false on first paint and true one frame later, so a freshly mounted card visibly turns over. */
export function useRevealed(enabled = true, delay = 350) {
  const [on, setOn] = useState(!enabled);
  useEffect(() => {
    if (!enabled) { setOn(true); return; }
    const t = setTimeout(() => setOn(true), delay);
    return () => clearTimeout(t);
  }, [enabled, delay]);
  return on;
}

/** Brass-ruled card back with the Bluff mark. */
export function CardBackFace({ className = "" }: { className?: string }) {
  return (
    <div className={`card-back grid place-items-center rounded-[14px] ${className}`}>
      <svg aria-hidden viewBox="0 0 80 80" className="h-20 w-20 opacity-90">
        <circle cx="40" cy="40" r="30" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2 3" />
        <circle cx="40" cy="40" r="22" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d="M40 22 52 40 40 58 28 40Z" fill="currentColor" opacity=".9" />
        <text x="40" y="45" textAnchor="middle" fontSize="15" fontWeight="700" fill="#1d1610" fontFamily="var(--font-display)">B</text>
      </svg>
    </div>
  );
}
