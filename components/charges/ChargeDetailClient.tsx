"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFailure } from "@/lib/client/api";
import type { Verdict } from "@/lib/schemas";
import type { TransactionDto } from "@/lib/types";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { FlagBadge } from "../ui/FlagBadge";
import { RunView } from "../verdict/RunView";
import { VerdictCard } from "../verdict/VerdictCard";
import { LinkedChargeCard, type LinkInfo } from "./LinkedChargeCard";
import { PriceSparkline } from "./PriceSparkline";
import { RefundBuilder } from "./RefundBuilder";
import type { DisputeDto } from "@/lib/disputes";
import { money, longDateTime } from "@/lib/format";

export type Candidate = { exposureId: string; host: string; exposureAt: string; exposureScore: number; fieldTypes: string[]; reasons: string[]; days: number; kind: "flagged" | "expected" };
export type Detail = {
  transaction: TransactionDto & { scripted: boolean; scriptId: string | null };
  best: Candidate | null; otherCount: number;
  verdict: (Verdict & { id: string }) | null;
  priceHistory: { day: string; sumCents: number }[];
  dispute: DisputeDto | null;
};

/** Decide how to present the link: the agent's decision wins; otherwise show the SQL link instantly. */
export function linkInfoFor(d: Detail, verdict: Verdict | null): LinkInfo {
  const b = d.best;
  const k = verdict?.linked?.kind;
  if (!b) return { kind: "none" };
  const base = { host: b.host, exposureAt: b.exposureAt, exposureScore: b.exposureScore, fieldTypes: b.fieldTypes, reasons: b.reasons, otherCount: d.otherCount, days: b.days };
  if (k === "possible") return { kind: "possible", ...base };
  return { kind: b.kind, ...base };
}

export function ChargeDetailClient({ detail, runId: initialRun }: { detail: Detail; runId?: string }) {
  const router = useRouter();
  const [runId, setRunId] = useState<string | null>(initialRun ?? null);
  const [running, setRunning] = useState(!!initialRun);
  const [err, setErr] = useState<string | null>(null);
  const [live, setLive] = useState<Verdict | null>(null);
  const t = detail.transaction;
  const verdict = live ?? detail.verdict;

  async function investigate() {
    setErr(null);
    try { const r = await api<{ runId: string }>(`/api/transactions/${t.id}/investigate`, { method: "POST" }); setRunId(r.runId); setRunning(true); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't start the check."); }
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="label">Charge · <span className="mono normal-case tracking-normal">{longDateTime(t.ts)}</span></p>
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <h1 className="mono break-all text-2xl font-semibold tracking-tight sm:text-3xl">{t.descriptor}</h1>
          <span className="num text-3xl font-semibold tracking-tight sm:text-4xl">{money(t.amountCents)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.flags.map((f) => <FlagBadge key={f} kind={f} />)}
          {t.scripted && detail.best && <Badge tone="accent" title="The demo posts this charge a few days after your exposure to show the link">Simulated: posted {detail.best.days} days after exposure</Badge>}
        </div>
      </header>

      <LinkedChargeCard link={linkInfoFor(detail, verdict)} charge={{ descriptor: t.descriptor, amountCents: t.amountCents, ts: t.ts }} pending={running} />

      {runId ? (
        <RunView runId={runId} onRetry={investigate} source="charge" subtitle={t.descriptor}
          onDone={(v) => { setRunning(false); if (v) setLive(v); router.refresh(); }}
          renderVerdict={(v, m) => <VerdictCard verdict={v} subtitle="Charge check" checkedEarlier={m.checkedEarlier} />} />
      ) : verdict ? (
        <VerdictCard verdict={verdict} subtitle="Charge check" />
      ) : (
        <div className="panel flex flex-col items-start gap-3 p-4">
          <p className="label">Agent</p>
          <Button onClick={investigate}>Investigate this charge</Button>
          <p className="text-xs text-dim">Bluff runs its agent over your history and Exposure Log.</p>
        </div>
      )}
      {err && <ErrorState message={err} />}
      {(runId || verdict) && !running && <Button variant="ghost" className="self-start" onClick={investigate}>Run the check again</Button>}

      <RefundBuilder txnId={t.id} canBuild={detail.best?.kind === "flagged"} initial={detail.dispute} />

      <section aria-label="Price history" className="panel flex flex-col gap-3 p-4">
        <h2 className="label">Price history with this merchant</h2>
        <PriceSparkline points={detail.priceHistory} current={t.amountCents} />
      </section>
    </div>
  );
}
