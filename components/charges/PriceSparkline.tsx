import { money } from "@/lib/format";

/** Daily spend for this merchant (from the merchant_daily aggregate). Needs ≥ 2 points. */
export function PriceSparkline({ points, current }: { points: { day: string; sumCents: number }[]; current?: number }) {
  if (points.length < 2) return <p className="text-sm text-dim">Not enough history from this merchant to draw a trend.</p>;
  const w = 240, h = 56, pad = 5;
  const max = Math.max(...points.map((p) => p.sumCents), current ?? 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / (max || 1)) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sumCents).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label={`Price history: ${points.length} charges, latest ${money(last.sumCents)}`} className="max-w-[260px] overflow-visible">
        <line x1={pad} x2={w - pad} y1={h - pad} y2={h - pad} stroke="var(--border)" />
        <path d={d} fill="none" stroke="var(--ink)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.sumCents)} r={i === points.length - 1 ? 4 : 2} fill={i === points.length - 1 ? "var(--scam)" : "var(--ink)"} />)}
      </svg>
      <figcaption className="font-mono text-xs text-dim">{points.length} days with charges · latest {money(last.sumCents)}</figcaption>
    </figure>
  );
}
