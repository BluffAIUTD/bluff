"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { useToast } from "../ui/Toast";
import { STORES } from "@/data/stores";
import type { ExposureDto } from "@/lib/types";

/** Leave / Continue / Continue and watch my charges (P1-2). Continue* log an exposure; then the core-loop CTA appears. */
export function ExposureActions({ verdictId, url, host, onLeave }: { verdictId: string; url: string; host: string; onLeave: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"continue" | "watch" | "sim" | null>(null);
  const [logged, setLogged] = useState<ExposureDto | null>(null);
  const [alert, setAlert] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const slug = STORES.find((s) => s.slug === host.replace(/^www\./, "").split(".")[0])?.slug ?? null;

  async function log(action: "continue" | "watch") {
    setBusy(action); setErr(null);
    try {
      const r = await api<{ exposure: ExposureDto; alert?: string }>("/api/exposures", { method: "POST", json: { verdictId, url, host, fieldTypes: ["card_number", "cvv"], action } });
      setLogged(r.exposure); setAlert(r.alert);
      toast("Logged in your Exposure Log");
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't log this. Try again."); }
    finally { setBusy(null); }
  }

  async function simulate() {
    if (!slug) return;
    setBusy("sim"); setErr(null);
    try {
      const r = await api<{ transaction: { id: string }; runId: string }>("/api/demo/next-charge", { method: "POST", json: { store: slug } });
      router.push(`/charges/${r.transaction.id}?run=${r.runId}`);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't post the charge. Try again."); setBusy(null); }
  }

  if (logged) {
    return (
      <div className="flex w-full flex-col gap-3">
        <p className="text-sm" role="status">
          Logged: <span className="font-medium">{logged.host}</span> is now in your <Link className="text-accent underline" href="/exposure">Exposure Log</Link>{logged.watch ? ", and I\u2019ll watch your charges." : "."}
          {alert === "queued" && <span className="text-dim">{" I\u2019ve texted you an alert."}</span>}
        </p>
        {slug ? <Button onClick={simulate} disabled={busy === "sim"}>{busy === "sim" ? "Posting charge…" : "Simulate a charge from this store"}</Button>
          : <p className="text-xs text-dim">Charge simulation is available for the 8 demo stores.</p>}
        {err && <ErrorState message={err} />}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={onLeave} disabled={!!busy}>Leave</Button>
        <Button variant="secondary" onClick={() => log("continue")} disabled={!!busy} aria-describedby="continue-hint">{busy === "continue" ? "Logging…" : "Continue"}</Button>
        <Button onClick={() => log("watch")} disabled={!!busy}>{busy === "watch" ? "Logging…" : "Continue and watch my charges"}</Button>
      </div>
      <p id="continue-hint" className="text-xs text-dim">Continue means you entered info here. Bluff logs it so a later charge can be linked back to this site.</p>
      {err && <ErrorState message={err} />}
    </div>
  );
}
