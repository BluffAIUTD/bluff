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
import { money, longDateTime } from "@/lib/format";

export type Candidate = { exposureId: string; host: string; exposureAt: string; exposureScore: number; fieldTypes: string[]; reasons: string[]; days: number; kind: "flagged" | "expected" };
export type Detail = {
  transaction: TransactionDto & { scripted: boolean; scriptId: string | null };
  best: Candidate | null; otherCount: number;
  verdict: (Verdict & { id: string }) | null;
  priceHistory: { day: string; sumCents: number }[];
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
      <header className="flex flex-col gap-2">
        <p className="text-sm text-dim">{longDateTime(t.ts)}</p>
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h1 className="font-grotesk text-3xl font-bold tracking-tight">{t.descriptor}</h1>
          <span className="num text-3xl font-bold">{money(t.amountCents)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.flags.map((f) => <FlagBadge key={f} kind={f} />)}
          {t.scripted && detail.best && <Badge tone="accent" title="The demo posts this charge a few days after your exposure to show the link">Simulated: posted {detail.best.days} days after exposure</Badge>}
        </div>
      </header>

      <LinkedChargeCard link={linkInfoFor(detail, verdict)} charge={{ descriptor: t.descriptor, amountCents: t.amountCents, ts: t.ts }} pending={running} />

      {runId ? (
        <RunView runId={runId} onRetry={investigate}
          onDone={(v) => { setRunning(false); if (v) setLive(v); router.refresh(); }}
          renderVerdict={(v, m) => <VerdictCard verdict={v} subtitle="Charge check" checkedEarlier={m.checkedEarlier} />} />
      ) : verdict ? (
        <VerdictCard verdict={verdict} subtitle="Charge check" />
      ) : (
        <div className="flex flex-col items-start gap-2">
          <Button onClick={investigate}>Investigate this charge</Button>
          <p className="text-xs text-dim">Bluff runs its agent over your history and Exposure Log.</p>
        </div>
      )}
      {err && <ErrorState message={err} />}
      {(runId || verdict) && !running && <Button variant="ghost" className="self-start" onClick={investigate}>Run the check again</Button>}

      <section aria-label="Price history" className="flex flex-col gap-2">
        <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Price history with this merchant</h2>
        <PriceSparkline points={detail.priceHistory} current={t.amountCents} />
      </section>
    </div>
  );
}
