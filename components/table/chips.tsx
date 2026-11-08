import { useId, type CSSProperties, type ReactNode } from "react";

export type ChipTone = "scam" | "unsure" | "safe" | "brass" | "ivory" | "blue" | "black";

/** body = chip face, rim = edge spots, hi = lighter center. */
export const CHIP_COLORS: Record<ChipTone, { body: string; rim: string; hi: string; ink: string }> = {
  scam: { body: "#b5362d", rim: "#f4ead2", hi: "#cf5146", ink: "#fff6e6" },
  unsure: { body: "#c4881f", rim: "#fbf0d2", hi: "#dfa43a", ink: "#2a1a02" },
  safe: { body: "#1f8157", rim: "#f4ead2", hi: "#33a371", ink: "#effff6" },
  brass: { body: "#b88a3c", rim: "#1d1610", hi: "#e3c27c", ink: "#1d1408" },
  ivory: { body: "#eadfc2", rim: "#2a2016", hi: "#fbf6e6", ink: "#1d1408" },
  blue: { body: "#2c5aa0", rim: "#f4ead2", hi: "#4676bd", ink: "#eef4ff" },
  black: { body: "#1d1a16", rim: "#d9b46b", hi: "#2c2822", ink: "#f1d894" },
};

/** Top view of a casino chip: edge spots, inner ring, soft highlight. Decorative. */
export function ChipDisc({ tone = "brass", size = 44, children, className = "" }: { tone?: ChipTone; size?: number; children?: ReactNode; className?: string }) {
  const c = CHIP_COLORS[tone];
  const id = useId().replace(/:/g, "");
  const circ = 2 * Math.PI * 42;
  return (
    <svg aria-hidden viewBox="0 0 100 100" width={size} height={size} className={`chip-disc shrink-0 ${className}`}>
      <defs>
        <radialGradient id={`h${id}`} cx="32%" cy="26%" r="80%">
          <stop offset="0" stopColor="#fff" stopOpacity=".34" />
          <stop offset=".55" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity=".32" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="49" fill={c.body} />
      <circle cx="50" cy="50" r="42" fill="none" stroke={c.rim} strokeWidth="13" strokeDasharray={`${circ / 16} ${circ / 16}`} strokeDashoffset={circ / 32} />
      <circle cx="50" cy="50" r="35.5" fill={c.body} stroke={c.rim} strokeWidth="1.6" />
      <circle cx="50" cy="50" r="30" fill="none" stroke={c.rim} strokeOpacity=".65" strokeWidth="1" strokeDasharray="1.6 2.6" />
      <circle cx="50" cy="50" r="25" fill={c.hi} />
      <circle cx="50" cy="50" r="49" fill={`url(#h${id})`} />
      <circle cx="50" cy="50" r="48.5" fill="none" stroke="#000" strokeOpacity=".35" />
      {children}
    </svg>
  );
}

/** Side view of a single chip, for stacks. Edge spots are the vertical stripes. */
export function ChipSide({ tone, className = "", style }: { tone: ChipTone; className?: string; style?: CSSProperties }) {
  const c = CHIP_COLORS[tone];
  const id = useId().replace(/:/g, "");
  return (
    <svg aria-hidden viewBox="0 0 100 34" className={className} style={style}>
      <defs>
        <clipPath id={`b${id}`}><path d="M2 17v8c0 8 21 12 48 12s48-4 48-12v-8H2Z" /></clipPath>
        <linearGradient id={`s${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity=".5" /><stop offset=".25" stopColor="#fff" stopOpacity=".12" /><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" />
        </linearGradient>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".28" /><stop offset=".6" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".25" /></linearGradient>
      </defs>
      <g clipPath={`url(#b${id})`}>
        <rect x="0" y="14" width="100" height="26" fill={c.body} />
        {Array.from({ length: 9 }, (_, i) => <rect key={i} x={3 + i * 11.2} y="14" width="5.6" height="26" fill={c.rim} opacity=".92" />)}
        <rect x="0" y="14" width="100" height="26" fill={`url(#s${id})`} />
      </g>
      <ellipse cx="50" cy="17" rx="48" ry="15" fill={c.body} stroke="#000" strokeOpacity=".4" />
      <ellipse cx="50" cy="17" rx="48" ry="15" fill={`url(#t${id})`} />
      <ellipse cx="50" cy="17" rx="37" ry="11.2" fill="none" stroke={c.rim} strokeOpacity=".85" strokeWidth="1.2" strokeDasharray="3 3" />
      <ellipse cx="50" cy="17" rx="25" ry="7.4" fill={c.hi} opacity=".9" />
    </svg>
  );
}
