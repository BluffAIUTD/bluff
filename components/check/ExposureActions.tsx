"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { useToast } from "../ui/Toast";
import { ChipButton } from "../table/ChipButton";
import { ChipDisc, type ChipTone } from "../table/chips";
import { STORES } from "@/data/stores";
import type { ExposureDto } from "@/lib/types";

const EyeGlyph = <path d="M20 50s11-17 30-17 30 17 30 17-11 17-30 17-30-17-30-17Zm30 8a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" fill="currentColor" stroke="none" style={{ color: "#f1d894" }} />;
const CheckGlyph = <path d="M33 51l11 11 23-24" fill="none" stroke="#eef4ff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />;
const LeaveGlyph = <path d="M62 30 42 50l20 20" fill="none" stroke="#2a2016" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />;

/**
 * Leave / Continue / Continue and watch my charges (P1-2). The three choices are chips you press. Continue* log an
 * exposure, and the chosen chip then slides into the "placed" spot; then the core-loop CTA appears.
 */
export function ExposureActions({ verdictId, url, host, onLeave }: { verdictId: string; url: string; host: string; onLeave: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"continue" | "watch" | "sim" | null>(null);
  const [logged, setLogged] = useState<ExposureDto | null>(null);
  const [alert, setAlert] = useState<string | undefined>();
  const [err, setErr] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ tone: ChipTone; from: { x: number; y: number } } | null>(null);
  const origin = useRef<{ tone: ChipTone; x: number; y: number } | null>(null);
  const spot = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);
  const slug = STORES.find((s) => s.slug === host.replace(/^www\./, "").split(".")[0])?.slug ?? null;

  // Once the exposure exists, measure from the pressed chip to the placed spot so the chip visibly slides there.
  useLayoutEffect(() => {
    if (!logged || !spot.current) return;
    const o = origin.current;
    const r = spot.current.getBoundingClientRect();
    if (o) setOffset({ x: o.x - (r.left + r.width / 2), y: o.y - (r.top + r.height / 2) });
    else setOffset({ x: 0, y: -80 });
  }, [logged]);

  async function log(action: "continue" | "watch", el: HTMLElement, tone: ChipTone) {
    const b = el.getBoundingClientRect();
    origin.current = { tone, x: b.left + 26, y: b.top + b.height / 2 };
    setBusy(action); setErr(null);
    try {
      const r = await api<{ exposure: ExposureDto; alert?: string }>("/api/exposures", { method: "POST", json: { verdictId, url, host, fieldTypes: ["card_number", "cvv"], action } });
      setPlaced({ tone, from: { x: 0, y: 0 } });
      setLogged(r.exposure); setAlert(r.alert);
      toast("Added to Sites you used your card on");
      router.refresh(); // the list under the checker picks up the new site
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

  if (logged && placed) {
    return (
      <div className="flex w-full flex-col gap-4">
        <div className="flex items-center gap-4 rounded-card border border-dashed brass-hairline bg-black/20 p-3">
          <div ref={spot} aria-hidden className="grid h-[76px] w-[76px] shrink-0 place-items-center rounded-full border-2 border-dashed border-accent/60 bg-black/25 shadow-[inset_0_2px_8px_rgba(0,0,0,0.6)]">
            {offset && (
              <span className="chip-place block" style={{ ["--from-x" as string]: `${offset.x}px`, ["--from-y" as string]: `${offset.y}px` }}>
                <ChipDisc tone={placed.tone} size={58}>{logged.watch ? EyeGlyph : CheckGlyph}</ChipDisc>
              </span>
            )}
          </div>
          <p className="text-sm leading-relaxed" role="status">
            Logged: <span className="font-semibold">{logged.host}</span> is now in your <a className="text-brass underline" href="#exposures">Sites you used your card on</a>{logged.watch ? ", and I’ll watch your charges." : "."}
            {alert === "delivered" && <span className="text-dim">{" I’ve sent an alert to your phone."}</span>}
          </p>
        </div>
        {slug ? <Button className="self-start" onClick={simulate} disabled={busy === "sim"}>{busy === "sim" ? "Posting charge…" : "Simulate a charge from this store"}</Button>
          : <p className="text-xs text-dim">Charge simulation is available for the {STORES.length} demo stores.</p>}
        {err && <ErrorState message={err} />}
      </div>
    );
  }
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <ChipButton tone="ivory" glyph={LeaveGlyph} onClick={onLeave} disabled={!!busy}>Leave</ChipButton>
        <ChipButton tone="blue" glyph={CheckGlyph} onClick={(e) => log("continue", e.currentTarget, "blue")} disabled={!!busy} aria-describedby="continue-hint">{busy === "continue" ? "Logging…" : "Continue"}</ChipButton>
        <ChipButton tone="black" glyph={EyeGlyph} onClick={(e) => log("watch", e.currentTarget, "black")} disabled={!!busy}
          className="!border-[#f1d894]/80">{busy === "watch" ? "Logging…" : "Continue and watch my charges"}</ChipButton>
      </div>
      <p id="continue-hint" className="text-xs leading-relaxed text-dim">Continue means you entered info here. Bluff logs it so a later charge can be linked back to this site. Leave logs nothing.</p>
      {err && <ErrorState message={err} />}
    </div>
  );
}
