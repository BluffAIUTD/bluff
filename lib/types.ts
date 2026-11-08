import type { FieldType, Verdict } from "./schemas";

/** continue/watch: the user entered info on a checked page. received_link: the link in a scam text the user reported. */
export type ExposureAction = "continue" | "watch" | "received_link";

export type ExposureDto = {
  id: string; url: string; host: string; label: string; fieldTypes: FieldType[]; score: number;
  verdict: string; verdictId: string | null; watch: boolean; userAction: ExposureAction;
  createdAt: string; linkedCount?: number;
  /** "page" (checked page / extension) or "sms" (reported text). */
  source?: string;
};

/** risky_site: the bank scan rated the charge's merchant website risky (latest site check for that website). */
export type FlagKindDto = "exposure_link" | "risky_site" | "price_drift" | "duplicate" | "new_subscription" | "card_test" | "expected_charge";

export type TransactionDto = {
  id: string; ts: string; descriptor: string; descriptorNorm: string; amountCents: number;
  mccCategory: string | null; isRecurring: boolean; flags: FlagKindDto[];
  /** 'nessie' for Capital One Nessie imports, 'seed' for synthetic history, 'demo' for scripted charges */
  source?: string; merchantName?: string | null; website?: string | null;
};

export type { Verdict };
