import { Badge } from "../ui/Badge";

/** Confidence is always shown with its reason (engineering_spec §6.4). */
export function ConfidencePill({ confidence, reason }: { confidence: number; reason: string }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex flex-col gap-2">
      <div><Badge tone={confidence < 0.5 ? "unsure" : "neutral"}>{pct}% sure</Badge></div>
      <p className="border-l-2 border-ink pl-3 font-display text-[17px] italic leading-snug text-fg">{reason}</p>
    </div>
  );
}
