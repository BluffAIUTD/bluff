import { money } from "@/lib/format";

/** Daily spend for this merchant (from the merchant_daily aggregate). Needs >= 2 points. */
export function PriceSparkline({ points, current }: { points: { day: string; sumCents: number }[]; current?: number }) {
  if (points.length < 2) return <p className="text-sm text-dim">Not enough history from this merchant to draw a trend.</p>;
  const w = 320, h = 64, pad = 6;
  const max = Math.max(...points.map((p) => p.sumCents), current ?? 0);
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / (max || 1)) * (h - 2 * pad);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.sumCents).toFixed(1)}`).join(" ");
  const area = `${d} L${x(points.length - 1).toFixed(1)} ${h} L${x(0).toFixed(1)} ${h} Z`;
  const last = points[points.length - 1];
  return (
    <figure className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-md" height={h} preserveAspectRatio="none" role="img" aria-label={`Price history: ${points.length} charges, latest ${money(last.sumCents)}`}>
        <defs><linearGradient id="spark" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".28" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#spark)" />
        <path d={d} fill="none" stroke="var(--accent)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {points.map((p, i) => <circle key={p.day} cx={x(i)} cy={y(p.sumCents)} r={i === points.length - 1 ? 3.5 : 2} fill={i === points.length - 1 ? "var(--accent)" : "var(--bg)"} stroke="var(--accent)" strokeWidth="1.4" />)}
      </svg>
      <figcaption className="mono text-xs text-dim">{points.length} days with charges · latest {money(last.sumCents)}</figcaption>
    </figure>
  );
}
