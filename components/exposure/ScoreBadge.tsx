import { Badge } from "../ui/Badge";
import { ChipDisc } from "../table/chips";
import { toneFor } from "../verdict/tone";

/** Score as a small chip plus the number; the chip color is the verdict band. */
export function ScoreBadge({ score }: { score: number }) {
  const t = toneFor(score);
  return (
    <Badge tone={t.label === "likely_scam" ? "scam" : t.label === "unsure" ? "unsure" : "safe"}>
      <ChipDisc tone={t.chip} size={14} className="-ml-1" />
      Score {score}
    </Badge>
  );
}
