import type { NavIcon } from "./nav";

const P: Record<NavIcon, string> = {
  home: "M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10",
  shield: "M12 3 4.5 6v5.5c0 4.5 3.2 7.8 7.5 9.5 4.3-1.7 7.5-5 7.5-9.5V6L12 3Zm-3 9 2.2 2.2L15.5 9.8",
  card: "M3 7h18v10H3V7Zm0 3.5h18M6.5 14.5h3",
  eye: "M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  cards: "M8 5h10v13H8V5Zm-3 2.5V19h10",
  chart: "M4 19V5m0 14h16M8 16v-4m4 4V8m4 8v-6",
  lock: "M6 11h12v9H6v-9Zm2.5 0V8a3.5 3.5 0 1 1 7 0v3",
};

export function Icon({ name, className = "h-5 w-5" }: { name: NavIcon; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={P[name]} />
    </svg>
  );
}
