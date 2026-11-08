import type { FieldType, Verdict } from "./schemas";

export type ExposureDto = {
  id: string; url: string; host: string; label: string; fieldTypes: FieldType[]; score: number;
  verdict: string; verdictId: string | null; watch: boolean; userAction: "continue" | "watch";
  createdAt: string; linkedCount?: number;
};

export type FlagKindDto = "exposure_link" | "price_drift" | "duplicate" | "new_subscription" | "card_test" | "expected_charge";

export type TransactionDto = {
  id: string; ts: string; descriptor: string; descriptorNorm: string; amountCents: number;
  mccCategory: string | null; isRecurring: boolean; flags: FlagKindDto[];
  /** 'nessie' for Capital One Nessie imports, 'seed' for synthetic history, 'demo' for scripted charges */
  source?: string; merchantName?: string | null; website?: string | null;
};

export type { Verdict };
