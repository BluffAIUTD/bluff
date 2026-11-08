export type SuitKind = "scam" | "unsure" | "safe";

export const SUIT_INK: Record<SuitKind, string> = { scam: "#b3281f", unsure: "#9a5d06", safe: "#17734c" };

/** Suit-like glyphs drawn for the three verdicts: diamond (scam), club (unsure), spade (safe). */
export function Suit({ kind, className = "h-5 w-5", color }: { kind: SuitKind; className?: string; color?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={className} fill={color ?? SUIT_INK[kind]}>
      {kind === "scam" && <path d="M12 1.5 21 12l-9 10.5L3 12 12 1.5Z" />}
      {kind === "unsure" && (
        <>
          <circle cx="12" cy="6.6" r="4.6" />
          <circle cx="6.4" cy="14" r="4.6" />
          <circle cx="17.6" cy="14" r="4.6" />
          <path d="M12 11c0 4-.6 7-2.4 10.4h4.8C12.600 18 12 15 12 11Z" />
        </>
      )}
      {kind === "safe" && <path d="M12 1.8S3 8.8 3 14.4a4.700 4.700 0 0 0 8.100 3.200c-.1 2-.8 3.500-2.100 4.800h6c-1.300-1.300-2-2.800-2.100-4.800A4.700 4.700 0 0 0 21 14.400C21 8.800 12 1.800 12 1.800Z" />}
    </svg>
  );
}
