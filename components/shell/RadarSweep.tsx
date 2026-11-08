"use client";

export type RadarState = "idle" | "scanning" | "done";
const TONE = { safe: "var(--safe)", scam: "var(--scam)", unsure: "var(--unsure)", neutral: "var(--accent)" } as const;

/** Blip positions come from the step index only (golden angle), one per real agent step. */
function blip(i: number) {
  const a = i * 2.399963;
  const r = 0.22 + ((i * 37) % 11) / 11 * 0.62;
  return { x: 50 + Math.cos(a) * r * 50, y: 50 + Math.sin(a) * r * 50 };
}

/** Sonar ring: sweeps while a check runs, pings once per step, settles to the verdict colour. Static under reduced motion. */
export function RadarSweep({ state = "idle", tone = "neutral", pings = 0, size = 96, className = "" }: { state?: RadarState; tone?: keyof typeof TONE; pings?: number; size?: number; className?: string }) {
  const c = TONE[tone];
  return (
    <div aria-hidden className={`relative shrink-0 rounded-full ${className}`} style={{ width: size, height: size, boxShadow: state === "done" ? `0 0 28px -8px ${c}` : undefined }}>
      {[100, 68, 36].map((p) => <span key={p} className="absolute rounded-full border" style={{ inset: `${(100 - p) / 2}%`, borderColor: state === "done" && p === 100 ? c : "var(--border-strong)", opacity: p === 100 ? 1 : 0.7 }} />)}
      <span className="absolute left-1/2 top-0 h-full w-px bg-line2/60" />
      <span className="absolute left-0 top-1/2 h-px w-full bg-line2/60" />
      {state === "scanning" && (
        <>
          <span className="radar-sweep absolute inset-0 rounded-full" style={{ background: `conic-gradient(from 0deg, transparent 0deg 250deg, ${c} 360deg)`, opacity: 0.55, maskImage: "radial-gradient(circle, transparent 0, #000 6%)", WebkitMaskImage: "radial-gradient(circle, transparent 0, #000 6%)" }} />
          <span className="radar-ring absolute inset-0 rounded-full border" style={{ borderColor: c }} />
        </>
      )}
      {Array.from({ length: Math.min(pings, 14) }).map((_, i) => {
        const b = blip(i);
        return <span key={i} className="ping-in absolute h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${b.x}%`, top: `${b.y}%`, background: c, boxShadow: `0 0 8px ${c}` }} />;
      })}
      <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ background: state === "idle" ? "var(--gray-4)" : c }} />
    </div>
  );
}
