import type { FlagKindDto } from "@/lib/types";
import { Badge, type Tone } from "./Badge";

export type FlagKind = FlagKindDto;

const META: Record<FlagKind, { label: string; tone: Tone; hint?: string }> = {
  exposure_link: { label: "Exposure link", tone: "scam" },
  risky_site: { label: "Risky site", tone: "scam", hint: "Bluff's bank scan rated this merchant's website risky" },
  price_drift: { label: "Price drift", tone: "unsure" },
  duplicate: { label: "Duplicate", tone: "unsure" },
  new_subscription: { label: "New subscription", tone: "unsure" },
  card_test: { label: "Card test", tone: "scam" },
  expected_charge: { label: "Expected charge", tone: "safe" },
};

export function FlagBadge({ kind }: { kind: FlagKind }) {
  const m = META[kind];
  return <Badge tone={m.tone} title={m.hint}>{m.label}</Badge>;
}
