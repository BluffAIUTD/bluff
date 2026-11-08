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
    <section aria-label="Refund Builder" className="panel flex flex-col gap-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="label">Dispute packet</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Refund Builder</h2>
        </div>
        {!dispute && (
          <span title={canBuild ? undefined : "Link this charge to a risky site first"}>
            <Button onClick={build} disabled={!canBuild || busy}>{busy ? "Drafting…" : "Build dispute"}</Button>
          </span>
        )}
        {dispute && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dispute.status === "filed" ? "safe" : "neutral"}>{dispute.status === "filed" ? "Marked as filed" : "Draft"}</Badge>
            {dispute.generatedBy === "template" && <Badge title="The AI draft was unavailable, so this letter is filled in from your data">Template letter</Badge>}
          </div>
        )}
      </div>
      <p role="note" className="mono rounded-control border border-line2 bg-surface2 px-3 py-2 text-[12px]"><span className="mr-2 text-accent">&#9679;</span>Bluff drafts. You decide. Not legal or financial advice.</p>
      {!canBuild && !dispute && <p className="text-sm text-dim">This charge isn&apos;t linked to a risky site, so there&apos;s nothing to dispute yet.</p>}

      {busy && (
        <div aria-busy className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={`h-4 ${i % 2 ? "w-3/4" : "w-full"}`} />)}
          {slow && <p className="mono text-sm text-dim">Still drafting…</p>}
        </div>
      )}
      {err && <ErrorState message={err} action={<button type="button" onClick={build} className="self-start text-sm font-medium text-accent underline">Try again</button>} />}

      {dispute && !busy && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <label htmlFor="letter" className="label">Letter (edit before you send it)</label>
            <textarea id="letter" value={letter} onChange={(e) => setLetter(e.target.value)} rows={18} className="mono min-h-[360px] w-full rounded-control border border-line2 bg-bg p-4 text-[13px] leading-relaxed outline-none transition focus:border-accent focus:shadow-[0_0_0_3px_rgb(var(--accent-rgb)/0.15)]" />
            <div className="flex flex-wrap gap-3">
              <Button onClick={copy}>Copy letter</Button>
              <Button variant="secondary" onClick={download}>Download .txt</Button>
              {dispute.status !== "filed" && <Button variant="secondary" onClick={markFiled}>Mark as filed</Button>}
            </div>
            <p className="text-xs text-dim">&ldquo;Mark as filed&rdquo; only records that you sent it. Bluff never sends anything.</p>
          </div>
          <div className="flex min-w-0 flex-col gap-7 lg:border-l lg:border-line lg:pl-6">
            <section aria-label="Evidence timeline">
              <h3 className="label mb-4">Evidence timeline</h3>
              <ol className="relative ml-1.5 flex flex-col gap-5 border-l border-line2 pl-5">
                {dispute.timeline.map((t, i) => {
                  const c = t.kind === "charge" ? "var(--scam)" : t.kind === "alert" ? "var(--unsure)" : "var(--accent)";
                  return (
                    <li key={i} className="relative">
                      <span aria-hidden className="absolute -left-[26px] top-1 h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 10px ${c}` }} />
                      <p className="mono text-[11px] text-dim">{longDateTime(t.at)}</p>
                      <p className="mt-0.5 text-sm font-medium">{t.label}</p>
                      <p className="text-sm text-dim">{t.detail}</p>
                    </li>
                  );
                })}
              </ol>
            </section>
            <NextSteps steps={dispute.nextSteps} title="Next steps" />
          </div>
        </div>
      )}
    </section>
  );
}
