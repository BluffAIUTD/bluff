import { Badge } from "../ui/Badge";

/** Confidence is always shown with its reason (engineering_spec §6.4). */
export function ConfidencePill({ confidence, reason }: { confidence: number; reason: string }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex flex-col gap-1">
      <Badge tone={confidence < 0.5 ? "unsure" : "neutral"}>{pct}% sure</Badge>
      <p className="text-xs text-dim">{reason}</p>
    </div>
  );
}
