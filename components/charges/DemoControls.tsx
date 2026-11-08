"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";

/** Presenter controls (shown with ?demo=1): post the next scripted charge, or reset the demo user. */
export function DemoControls() {
  const router = useRouter();
  const [busy, setBusy] = useState<"next" | "reset" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  async function next() {
    setBusy("next"); setErr(null);
    try { const r = await api<{ transaction: { id: string }; runId: string }>("/api/demo/next-charge", { method: "POST", json: {} }); router.push(`/charges/${r.transaction.id}?run=${r.runId}`); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't post the charge."); setBusy(null); }
  }
  async function reset() {
    if (!confirm("Reset the demo? This clears exposures, disputes and game data for Maya.")) return;
    setBusy("reset"); setErr(null);
    try { await api("/api/demo/reset", { method: "POST" }); router.refresh(); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't reset."); }
    finally { setBusy(null); }
  }
  return (
    <section aria-label="Demo controls" className="flex flex-col gap-3 rounded-card border border-dashed border-accent/40 bg-accent/[0.03] p-4">
      <p className="label !text-accent">Demo controls · presenter</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={next} disabled={!!busy}>{busy === "next" ? "Posting…" : "Post next charge"}</Button>
        <Button variant="secondary" onClick={reset} disabled={!!busy}>{busy === "reset" ? "Resetting…" : "Reset demo"}</Button>
      </div>
      {err && <ErrorState message={err} />}
    </section>
  );
}
