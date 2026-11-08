import type { RunModeValue, RunStreamEvent, Verdict } from "../schemas";

export type RunKind = "page" | "message" | "txn" | "site";
export type FailureMode = "timeout" | "malformed" | "ratelimit";

export type RunInput =
  | { kind: "page"; userId: string; url: string; host: string; fieldTypes: string[]; signals: Record<string, boolean | number | string>; source: "extension" | "check" }
  | { kind: "message"; userId: string; text: string; source: "check" | "sms" | "eval" }
  | { kind: "txn"; userId: string; txnId: string }
  /** Bank scan: the merchant website behind a (Nessie) bank transaction. */
  | { kind: "site"; userId: string; txnId: string; host: string | null; merchant: string; descriptor: string };

export type Emit = (e: RunStreamEvent) => void;

export type RunOptions = { fail?: FailureMode; signal?: AbortSignal };

/** Outcome of a run. The verdict always exists (falls back to rules-only "basic"). */
export type RunResult = { verdict: Verdict; mode: RunModeValue; error?: { code: string; message: string } };

export type Runner = (input: RunInput, emit: Emit, opts?: RunOptions) => Promise<RunResult>;

/** Subject identifier stored on verdict/run rows. */
export function subjectId(i: RunInput): string {
  if (i.kind === "page") return i.host;
  if (i.kind === "txn") return i.txnId;
  if (i.kind === "site") return i.host ?? `merchant:${i.merchant.toLowerCase()}`;
  return "message";
}
