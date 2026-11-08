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
import { CornerIndex } from "../table/PlayingCardFace";
import type { SuitKind } from "../table/Suit";

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
    <section aria-label="Refund Builder" className="stitch flex flex-col gap-5 rounded-card border brass-hairline bg-surface p-4 sm:p-6">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brass">Your hand</p>
          <h2 className="text-2xl font-semibold">Refund Builder</h2>
        </div>
        {!dispute && (
          <span title={canBuild ? undefined : "Link this charge to a risky site first"}>
            <Button onClick={build} disabled={!canBuild || busy}>{busy ? "Drafting…" : "Build dispute"}</Button>
          </span>
        )}
      </div>
      <p role="note" className="relative z-10 rounded-control border border-dashed brass-hairline bg-black/25 px-3 py-2 text-sm">Bluff drafts. You decide. Not legal or financial advice.</p>
      {!canBuild && !dispute && <p className="relative z-10 text-sm text-dim">This charge isn&apos;t linked to a risky site, so there&apos;s nothing to dispute yet.</p>}
      {busy && (
        <div aria-busy className="relative z-10 flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className={`h-4 ${i % 2 ? "w-3/4" : "w-full"}`} />)}
          {slow && <p className="text-sm text-dim">Still drafting…</p>}
        </div>
      )}
      {err && <ErrorState message={err} action={<button type="button" onClick={build} className="self-start text-sm font-medium text-brass underline">Try again</button>} />}
      {dispute && !busy && (
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={dispute.status === "filed" ? "safe" : "neutral"}>{dispute.status === "filed" ? "Marked as filed" : "Draft"}</Badge>
            {dispute.generatedBy === "template" && <Badge title="The AI draft was unavailable, so this letter is filled in from your data">Template letter</Badge>}
          </div>
          <section aria-label="Evidence timeline">
            <h3 className="mb-3 font-grotesk uppercase text-dim">Evidence timeline</h3>
            <ol className="grid gap-3 sm:flex sm:overflow-x-auto sm:pb-3 sm:pr-2">
              {dispute.timeline.map((t, i) => {
                const suit: SuitKind = t.kind === "charge" ? "scam" : t.kind === "alert" ? "unsure" : "safe";
                return (
                  <li key={i} className="card-face deal relative min-h-[132px] rounded-[12px] py-3 pl-12 pr-4 sm:w-[210px] sm:shrink-0" style={{ ["--i" as string]: i }}>
                    <CornerIndex rank="" suit={suit} />
                    <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#6a5a36]">{longDateTime(t.at)}</p>
                    <p className="serif mt-1 text-[15px] font-bold leading-snug">{t.label}</p>
                    <p className="mt-1 text-[13px] leading-snug text-[#4d4128]">{t.detail}</p>
                  </li>
                );
              })}
            </ol>
          </section>
          <div>
            <label htmlFor="letter" className="mb-2 block font-grotesk uppercase text-dim">Letter (edit before you send it)</label>
            <div className="paper rounded-[6px] px-4 py-5 sm:px-8 sm:py-7">
              <textarea id="letter" value={letter} onChange={(e) => setLetter(e.target.value)} rows={16} className="w-full resize-y rounded-[4px] bg-transparent p-1 font-mono text-[13px] leading-relaxed text-[#2a2418] outline-none focus:ring-2 focus:ring-[#a47b33]/60" />
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button onClick={copy}>Copy letter</Button>
            <Button variant="secondary" onClick={download}>Download .txt</Button>
            {dispute.status !== "filed" && <Button variant="secondary" onClick={markFiled}>Mark as filed</Button>}
          </div>
          <p className="text-xs text-dim">&ldquo;Mark as filed&rdquo; only records that you sent it. Bluff never sends anything.</p>
          <NextSteps steps={dispute.nextSteps} title="Next steps" />
        </div>
      )}
    </section>
  );
}
