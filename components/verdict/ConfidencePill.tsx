import { Badge } from "../ui/Badge";

/** Confidence is always shown with its reason (engineering_spec §6.4). */
export function ConfidencePill({ confidence, reason }: { confidence: number; reason: string }) {
  const pct = Math.round(confidence * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge tone={confidence < 0.5 ? "unsure" : "neutral"}>{pct}% sure</Badge>
        <span aria-hidden className="h-1 w-24 overflow-hidden rounded-full bg-surface3"><span className="block h-full rounded-full bg-gray-3" style={{ width: `${pct}%` }} /></span>
      </div>
      <p className="max-w-md text-xs leading-relaxed text-dim">{reason}</p>
    </div>
  );
}
