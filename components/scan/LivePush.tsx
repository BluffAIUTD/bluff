"use client";
import { useEffect, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { LIVE_PUSH_PRESETS, livePushPreset, type LivePushPreset } from "@/data/nessieSeed";
import { Button } from "../ui/Button";
import { headline, LABEL, toneOf, type MerchantView } from "./types";

export type PushResponse = { purchaseId: string; txnId: string; scanId: string; preset: string; merchant: string; amount: number; purchaseDate: string; card: { nickname: string; last4: string } };

const GROUPS: { id: LivePushPreset["group"]; title: string }[] = [
  { id: "scam_demo", title: "Scam-pattern demo stores (Bluff's own fake sites)" },
  { id: "legit", title: "Real and demo legit merchants" },
];

/**
 * "Try it": posts a real purchase to Maya's Capital One Nessie sandbox card. Bluff then picks it up like any new charge
 * (the parent streams the partial scan). `tracked` is the merchant row of the last purchase, for the status line.
 */
export function LivePush({ initialPreset, defaultOpen, disabled, tracked, onPushed }: {
  initialPreset?: string | null; defaultOpen?: boolean; disabled?: boolean; tracked: MerchantView | null; onPushed: (r: PushResponse) => void;
}) {
  const initial = livePushPreset(initialPreset)?.preset ?? null;
  const [open, setOpen] = useState(!!defaultOpen || !!initialPreset);
  const [preset, setPreset] = useState<LivePushPreset>(initial ?? LIVE_PUSH_PRESETS[0]);
  const [amount, setAmount] = useState(String((initial ?? LIVE_PUSH_PRESETS[0]).amount));
  const [fresh, setFresh] = useState(true);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState<PushResponse | null>(null);
  const [declined, setDeclined] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const p = livePushPreset(initialPreset)?.preset;
    if (p) { setPreset(p); setAmount(String(p.amount)); setOpen(true); }
  }, [initialPreset]);

  const pick = (p: LivePushPreset) => { setPreset(p); setAmount(String(p.amount)); setDeclined(null); setErr(null); };
  const dollars = Math.round(Number(amount));
  const valid = Number.isFinite(dollars) && dollars >= 1 && dollars <= 999;

  const charge = async () => {
    if (!valid || busy) return;
    setBusy(true); setErr(null); setDeclined(null);
    try {
      const r = await api<PushResponse>("/api/scan/push", { method: "POST", json: { preset: preset.key, amount: dollars, fresh } });
      setPosted(r);
      onPushed(r);
    } catch (e) {
      if (e instanceof ApiFailure && e.code === "card_on_hold") setDeclined(e.message);
      else setErr(e instanceof ApiFailure ? e.message : "Couldn't post the purchase. Try again.");
    } finally { setBusy(false); }
  };

  const v = tracked ? headline(tracked) : null;
  const checking = !!posted && (!tracked || tracked.phase !== "done" && tracked.phase !== "error");
  const tone = toneOf(v?.verdict);

  return (
    <section aria-labelledby="livepush-h" className="stitch rounded-card border brass-hairline bg-surface [&>*]:relative [&>*]:z-10">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="livepush-body"
        className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2 text-left">
        <span className="min-w-0">
          <span id="livepush-h" className="serif block text-lg font-semibold">Try it: make a purchase on Maya&apos;s test card</span>
          {!open && <span className="block truncate text-xs text-dim">Posts a real purchase to the Capital One Nessie sandbox. Bluff checks it like any new charge.</span>}
        </span>
        <span aria-hidden className={`shrink-0 text-brass transition duration-ui ${open ? "rotate-180" : ""}`}>▾</span>
      </button>
      {open && (
        <div id="livepush-body" className="flex flex-col gap-3 border-t border-dashed brass-hairline px-4 pb-4 pt-3">
          <p className="text-sm text-dim">Posts a real purchase to the Capital One Nessie sandbox (synthetic customer, test card). Bluff picks it up like any new charge on the card and checks the store&apos;s website.</p>
          {GROUPS.map((gr) => (
            <div key={gr.id}>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-dim">{gr.title}</p>
              <div role="group" aria-label={gr.title} className="flex flex-wrap gap-1.5">
                {LIVE_PUSH_PRESETS.filter((p) => p.group === gr.id).map((p) => {
                  const on = p.key === preset.key;
                  return (
                    <button key={p.key} type="button" aria-pressed={on} onClick={() => pick(p)} title={p.note}
                      className={`chip-btn inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-sm transition duration-ui ${on ? (gr.id === "scam_demo" ? "border-scam/70 bg-scam/15 shadow-[0_0_0_2px_rgba(244,123,112,0.3)]" : "border-safe/70 bg-safe/15 shadow-[0_0_0_2px_rgba(95,207,151,0.3)]") : "brass-hairline bg-black/25 hover:border-accent"}`}>
                      <span className="font-semibold">{p.label}</span><span className="num text-xs text-dim">${p.amount}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-xs text-dim">Amount (whole dollars, $1 to $999)</span>
              <span className="field inline-flex min-h-[44px] items-center rounded-full px-4 focus-within:border-[#f1d894]">
                <span aria-hidden className="text-dim">$</span>
                <input type="number" inputMode="numeric" min={1} max={999} step={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={!valid} className="num w-20 bg-transparent px-1 outline-none" />
              </span>
            </label>
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={fresh} onChange={(e) => setFresh(e.target.checked)} className="h-4 w-4 accent-[var(--brass-2)]" />
              <span>Fresh Nemotron review <span className="text-xs text-dim">(off: reuse one from the last 24 h)</span></span>
            </label>
            <Button onClick={charge} disabled={busy || disabled || !valid} className="ml-auto">{busy ? "Charging…" : `Charge the card $${valid ? dollars : "–"}`}</Button>
          </div>
          {!valid && <p className="text-xs text-unsure">Nessie stores whole dollars: enter 1 to 999.</p>}
          {disabled && <p className="text-xs text-dim">Capital One Nessie isn&apos;t connected on this server.</p>}
          {declined && <p role="alert" className="rounded-control border border-scam/60 bg-scam/10 px-3 py-2 text-sm font-semibold text-scam">{declined}</p>}
          {err && <p role="alert" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">{err}</p>}
          {posted && !declined && (
            <p role="status" aria-live="polite" className="text-sm">
              Posted ${posted.amount} to Capital One Nessie (purchase <span className="font-mono">{posted.purchaseId.slice(0, 4)}…</span>).{" "}
              {checking ? <span className="text-dim">Checking the site…</span>
                : v ? <span className={`font-medium ${tone === "scam" ? "text-scam" : tone === "unsure" ? "text-unsure" : "text-safe"}`}>{LABEL[v.verdict]} · {v.score}/100</span>
                : <span className="text-dim">Checked. See the result below.</span>}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
