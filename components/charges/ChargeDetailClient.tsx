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
    <div className="flex flex-col gap-8">
      <header className="no-print flex flex-col gap-3 border-b-2 border-ink pb-5">
        <p className="eyebrow">Case file · Charge · <span className="num normal-case tracking-normal">{longDateTime(t.ts)}</span></p>
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
          <h1 className="break-all font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">{t.descriptor}</h1>
          <span className="numeral text-5xl font-semibold sm:text-6xl">{money(t.amountCents)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {t.flags.map((f) => <FlagBadge key={f} kind={f} />)}
          {t.scripted && detail.best && <Badge tone="accent" title="The demo posts this charge a few days after your exposure to show the link">Simulated: posted {detail.best.days} days after exposure</Badge>}
        </div>
      </header>

      <div className="no-print"><LinkedChargeCard link={linkInfoFor(detail, verdict)} charge={{ descriptor: t.descriptor, amountCents: t.amountCents, ts: t.ts }} pending={running} /></div>

      <div className="no-print grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-5">
          {runId ? (
            <RunView runId={runId} onRetry={investigate}
              onDone={(v) => { setRunning(false); if (v) setLive(v); router.refresh(); }}
              renderVerdict={(v, m) => <VerdictCard verdict={v} subtitle="Charge check" checkedEarlier={m.checkedEarlier} exhibitFrom={2} />} />
          ) : verdict ? (
            <VerdictCard verdict={verdict} subtitle="Charge check" animate={false} exhibitFrom={2} />
          ) : (
            <div className="dossier flex flex-col items-start gap-3 p-5">
              <p className="eyebrow">Next step</p>
              <p className="font-display text-xl italic">Ask Bluff to look into this charge.</p>
              <Button onClick={investigate}>Investigate this charge</Button>
              <p className="text-xs text-dim">Bluff runs its agent over your history and Exposure Log.</p>
            </div>
          )}
          {err && <ErrorState message={err} />}
          {(runId || verdict) && !running && <Button variant="ghost" className="self-start" onClick={investigate}>Run the check again</Button>}
        </div>
        <aside aria-label="Marginalia" className="flex flex-col gap-3 border-l-0 border-t border-line pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <section aria-label="Price history" className="flex flex-col gap-2">
            <h2 className="eyebrow">Price history with this merchant</h2>
            <PriceSparkline points={detail.priceHistory} current={t.amountCents} />
          </section>
        </aside>
      </div>

      <RefundBuilder txnId={t.id} canBuild={detail.best?.kind === "flagged"} initial={detail.dispute} />
    </div>
  );
}
