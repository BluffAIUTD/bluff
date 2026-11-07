import { Badge, type Tone } from "./Badge";

export type FlagKind = "exposure_link" | "price_drift" | "duplicate" | "new_subscription" | "card_test" | "expected_charge";

const META: Record<FlagKind, { label: string; tone: Tone }> = {
  exposure_link: { label: "Exposure link", tone: "scam" },
  price_drift: { label: "Price drift", tone: "unsure" },
  duplicate: { label: "Duplicate", tone: "unsure" },
  new_subscription: { label: "New subscription", tone: "unsure" },
  card_test: { label: "Card test", tone: "scam" },
  expected_charge: { label: "Expected charge", tone: "safe" },
};

export function FlagBadge({ kind }: { kind: FlagKind }) {
  const m = META[kind];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}
