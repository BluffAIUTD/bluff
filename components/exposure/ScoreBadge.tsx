import { Badge } from "../ui/Badge";
import { toneFor } from "../verdict/tone";

export function ScoreBadge({ score }: { score: number }) {
  const t = toneFor(score);
  return <Badge tone={t.label === "likely_scam" ? "scam" : t.label === "unsure" ? "unsure" : "safe"}>Score {score}</Badge>;
}
