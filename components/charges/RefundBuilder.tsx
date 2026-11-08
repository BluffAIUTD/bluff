"use client";
import { useEffect, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import type { DisputeDto } from "@/lib/disputes";
import { longDateTime } from "@/lib/format";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { NextSteps } from "../verdict/NextSteps";

export const SLOW_DRAFT_MS = 8000;

/** Refund Builder: letter + evidence timeline + next steps. Drafts only; Bluff never files or sends anything. */
export function RefundBuilder({ txnId, canBuild, initial }: { txnId: string; canBuild: boolean; initial: DisputeDto | null }) {
  const toast = useToast();
  const [dispute, setDispute] = useState<DisputeDto | null>(initial);
  const [letter, setLetter] = useState(initial?.letter ?? "");
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), SLOW_DRAFT_MS);
    return () => clearTimeout(t);
  }, [busy]);

  async function build() {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ dispute: DisputeDto }>("/api/disputes", { method: "POST", json: { txnId } });
      setDispute(r.dispute); setLetter(r.dispute.letter);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't draft the dispute. Try again."); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(letter); toast("Letter copied"); } catch { toast("Couldn't copy. Select the text manually."); }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([letter], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = "dispute-letter.txt"; a.click();
    URL.revokeObjectURL(url);
  }

  async function markFiled() {
    if (!dispute) return;
    try { const r = await api<{ dispute: DisputeDto }>(`/api/disputes/${dispute.id}`, { method: "PATCH", json: { status: "filed" } }); setDispute(r.dispute); toast("Marked as filed"); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't update the status."); }
  }

  return (
    <section id="dispute-packet" aria-label="Refund Builder" className="dossier flex flex-col gap-6 border-t-[5px] border-t-ink p-5 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div>
          <p className="eyebrow">Dispute packet</p>
          <h2 className="font-display text-3xl font-semibold">Refund Builder</h2>
        </div>
        {!dispute && (
          <span title={canBuild ? undefined : "Link this charge to a risky site first"}>
            <Button onClick={build} disabled={!canBuild || busy}>{busy ? "Drafting…" : "Build dispute"}</Button>
          </span>
        )}
      </div>
      {!canBuild && !dispute && <p className="max-w-xl text-[15px] text-dim">This charge isn&apos;t linked to a risky site, so there&apos;s nothing to dispute yet.</p>}

      {busy && (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={`h-4 ${i % 2 ? "w-3/4" : "w-full"}`} />)}
          {slow && <p className="text-sm text-dim">Still drafting…</p>}
        </div>
      )}
      {err && <ErrorState message={err} action={<button type="button" onClick={build} className="self-start text-sm font-medium text-accent underline">Try again</button>} />}

      {dispute && !busy && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="no-print flex flex-wrap items-center gap-2">
              <Badge tone={dispute.status === "filed" ? "safe" : "neutral"}>{dispute.status === "filed" ? "Marked as filed" : "Draft"}</Badge>
              {dispute.generatedBy === "template" && <Badge title="The AI draft was unavailable, so this letter is filled in from your data">Template letter</Badge>}
            </div>
            <div>
              <label htmlFor="letter" className="eyebrow mb-2 block">Letter (edit before you send it)</label>
              <textarea id="letter" value={letter} onChange={(e) => setLetter(e.target.value)} rows={18}
                className="w-full resize-y rounded-[2px] border border-gray-3 bg-white p-5 font-mono text-[13px] leading-[1.75] shadow-[inset_0_1px_0_rgb(0_0_0/.03)] outline-none focus:border-accent" />
            </div>
            <div className="no-print flex flex-wrap gap-3">
              <Button onClick={copy}>Copy letter</Button>
              <Button variant="secondary" onClick={download}>Download .txt</Button>
              <Button variant="secondary" onClick={() => window.print()}>Print</Button>
              {dispute.status !== "filed" && <Button variant="secondary" onClick={markFiled}>Mark as filed</Button>}
            </div>
            <p className="no-print text-xs text-dim">&ldquo;Mark as filed&rdquo; only records that you sent it. Bluff never sends anything.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <section aria-label="Evidence timeline">
              <h3 className="eyebrow mb-4">Evidence timeline</h3>
              <ol className="relative ml-2 flex flex-col gap-5 border-l border-ink pl-6">
                {dispute.timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className={`absolute -left-[31px] top-1 h-[11px] w-[11px] rounded-full border-2 border-surface ${t.kind === "charge" ? "bg-scam" : t.kind === "alert" ? "bg-unsure" : "bg-ink"}`} />
                    <p className="font-mono text-xs text-dim">{longDateTime(t.at)}</p>
                    <p className="font-medium">{t.label}</p>
                    <p className="text-sm text-dim">{t.detail}</p>
                  </li>
                ))}
              </ol>
            </section>
            <NextSteps steps={dispute.nextSteps} title="Next steps" />
          </div>
        </div>
      )}
      <p role="note" className="rule-top pt-4 text-center font-display text-lg italic">Bluff drafts. You decide. Not legal or financial advice.</p>
    </section>
  );
}
