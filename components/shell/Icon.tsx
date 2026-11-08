import type { NavIcon } from "./nav";

export type IconName = NavIcon | "search" | "more" | "close" | "bolt" | "phone" | "trace" | "chevron" | "arrow" | "command";

const P: Record<IconName, string> = {
  home: "M4 5h6.5v6.5H4V5Zm9.5 0H20v4h-6.5V5ZM4 14.5h6.5V19H4v-4.5Zm9.5-2H20V19h-6.5v-6.5Z",
  radar: "M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5M12 12l6-6M12 12h.01",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 9.8",
  card: "M3 7h18v10H3V7Zm0 3.5h18M6.5 14.5h3",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  cards: "M8 5h10v13H8V5Zm-3 2.5V19h10",
  chart: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-6",
  lock: "M6 11h12v9H6v-9Zm2.5 0V8a3.5 3.5 0 1 1 7 0v3",
  search: "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm4.8 11.3L20 20",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  close: "M6 6l12 12M18 6 6 18",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  phone: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm3 15.5h2",
  trace: "M4 6h10M4 12h16M4 18h7",
  chevron: "M9 6l6 6-6 6",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  command: "M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6Z",
};

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={P[name]} />
    </svg>
  );
}
