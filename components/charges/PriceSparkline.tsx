import { money } from "@/lib/format";

/** Daily spend for this merchant (from the merchant_daily aggregate). Needs ≥ 2 points. */
export function PriceSparkline({ points, current }: { points: { day: string; sumCents: number }[]; current?: number }) {
  if (points.length < 2) return <p className="text-sm text-dim">Not enough history from this merchant to draw a trend.</p>;
  const w = 240, h = 48, pad = 4;
  const max = Math.max(...points.map((p) => p.sumCents), current ?? 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / (max || 1)) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sumCents).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  return (
    <figure className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Price history: ${points.length} charges, latest ${money(last.sumCents)}`}>
        <path d={d} fill="none" stroke="var(--brass-2)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.sumCents)} r={i === points.length - 1 ? 3.5 : 2} fill="var(--brass-1)" />)}
      </svg>
      <figcaption className="text-xs text-dim">{points.length} days with charges · latest {money(last.sumCents)}</figcaption>
    </figure>
  );
}
