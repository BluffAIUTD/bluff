"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { STORES } from "@/data/stores";
import { api, ApiFailure } from "@/lib/client/api";
import { money } from "@/lib/format";
import type { ExposureDto, TransactionDto } from "@/lib/types";
import { Icon, type IconName } from "./Icon";
import { useToast } from "../ui/Toast";
import { EVT, NAV_ITEMS, fire } from "./nav";

type Item = { id: string; group: string; label: string; hint?: string; icon: IconName; keys: string; run: () => void | Promise<void> };

/** Cmd/Ctrl+K palette: routes, stores to check, recent real items, and real actions. */
export function CommandPalette() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [exposures, setExposures] = useState<ExposureDto[]>([]);
  const [charges, setCharges] = useState<TransactionDto[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => setMounted(true), []);

  const close = useCallback(() => { setOpen(false); setQ(""); setIdx(0); (opener.current as HTMLElement | null)?.focus?.(); }, []);
  const show = useCallback(() => { opener.current = document.activeElement; setOpen(true); }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => { if (!o) opener.current = document.activeElement; return !o; }); } };
    window.addEventListener("keydown", key);
    window.addEventListener(EVT.palette, show);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener(EVT.palette, show); };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    api<{ exposures: ExposureDto[] }>("/api/exposures").then((r) => setExposures(r.exposures.slice(0, 4))).catch(() => setExposures([]));
    api<{ transactions: TransactionDto[] }>("/api/transactions?limit=40").then((r) => setCharges(r.transactions.filter((t) => t.flags.some((f) => f !== "expected_charge")).slice(0, 4))).catch(() => setCharges([]));
  }, [open]);

  const go = useCallback((href: string, focusId?: string) => () => {
    router.push(href);
    if (focusId) setTimeout(() => document.getElementById(focusId)?.focus(), 350);
  }, [router]);

  const items = useMemo<Item[]>(() => [
    ...NAV_ITEMS.map((n): Item => ({ id: `nav-${n.href}`, group: "Go to", label: n.label, hint: n.href, icon: n.icon, keys: `${n.label} ${n.href}`, run: go(n.href) })),
    { id: "a-scan", group: "Actions", label: "Scan my transactions", hint: "bank scan", icon: "radar", keys: "scan bank nessie crawl start", run: go("/scan?start=1") },
    { id: "a-link", group: "Actions", label: "Check a link", hint: "paste a URL", icon: "shield", keys: "check link url website domain", run: go("/check#url", "url") },
    { id: "a-text", group: "Actions", label: "Check a text message", hint: "paste a message", icon: "shield", keys: "check text message sms paste forward", run: go("/check#msg", "msg") },
    { id: "a-flag", group: "Actions", label: "Show flagged charges", hint: "charges", icon: "card", keys: "flagged charges risky", run: go("/charges?f=flagged") },
    { id: "a-next", group: "Actions", label: "Post next demo charge", hint: "demo", icon: "bolt", keys: "simulate demo charge next post",
      run: async () => {
        try { const r = await api<{ transaction: { id: string }; runId: string }>("/api/demo/next-charge", { method: "POST", json: {} }); router.push(`/charges/${r.transaction.id}?run=${r.runId}`); }
        catch (e) { toast(e instanceof ApiFailure ? e.message : "Couldn't post the charge."); }
      } },
    { id: "a-phone", group: "Actions", label: "Open phone preview", hint: "T-Mobile alerts", icon: "phone", keys: "phone text messages alerts t-mobile forward watch dispute", run: () => fire(EVT.phone) },
    { id: "a-priv", group: "Actions", label: "What leaves my device", hint: "privacy", icon: "lock", keys: "privacy data sent leaves device", run: go("/privacy#sent") },
    { id: "a-del", group: "Actions", label: "Delete everything", hint: "privacy", icon: "lock", keys: "delete reset erase data", run: go("/privacy#delete") },
    ...STORES.map((s): Item => ({ id: `store-${s.slug}`, group: "Check a store", label: s.slug, hint: "demo store", icon: "shield", keys: `${s.slug} ${s.name} store check demo`, run: go(`/check?store=${s.slug}`) })),
    ...exposures.map((e): Item => ({ id: `exp-${e.id}`, group: "Recent exposures", label: e.host, hint: `score ${e.score}`, icon: "eye", keys: `${e.host} exposure`, run: go("/exposure") })),
    ...charges.map((t): Item => ({ id: `chg-${t.id}`, group: "Flagged charges", label: t.descriptor, hint: money(t.amountCents), icon: "card", keys: `${t.descriptor} charge`, run: go(`/charges/${t.id}`) })),
  ], [exposures, charges, go, router, toast]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items.slice(0, 40);
    return items.filter((i) => t.split(/\s+/).every((w) => `${i.label} ${i.keys}`.toLowerCase().includes(w))).slice(0, 30);
  }, [items, q]);
  useEffect(() => setIdx(0), [q]);
  useEffect(() => { document.getElementById(`cp-opt-${idx}`)?.scrollIntoView({ block: "nearest" }); }, [idx]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(shown.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const it = shown[idx]; if (it) { close(); void it.run(); } }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "Tab") { e.preventDefault(); input.current?.focus(); }
  }

  if (!open || !mounted) return null;
  let lastGroup = "";
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[10vh]">
      <button type="button" tabIndex={-1} aria-label="Close palette" onClick={close} className="fade-in absolute inset-0 bg-black/65 backdrop-blur-[2px]" />
      <div role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKey} className="panel ping-in relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden !bg-surface2 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" className="h-4 w-4 text-dim" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} role="combobox" aria-expanded="true" aria-controls="cp-list" aria-activedescendant={shown[idx] ? `cp-opt-${idx}` : undefined} aria-label="Search routes, stores and actions"
            placeholder="Jump to a page, a store to check, or an action" className="mono h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-gray-4" />
          <kbd className="mono rounded border border-line2 px-1.5 py-0.5 text-[10px] text-dim">esc</kbd>
        </div>
        <ul id="cp-list" role="listbox" aria-label="Results" className="scroll-thin overflow-y-auto p-2">
          {shown.length === 0 && <li className="mono px-3 py-6 text-center text-sm text-dim">Nothing matches &ldquo;{q}&rdquo;.</li>}
          {shown.map((it, i) => {
            const head = it.group !== lastGroup; lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {head && <p className="label px-3 pb-1 pt-3">{it.group}</p>}
                <div id={`cp-opt-${i}`} role="option" aria-selected={i === idx} onMouseMove={() => setIdx(i)} onClick={() => { close(); void it.run(); }}
                  className={`flex min-h-[40px] cursor-pointer items-center gap-3 rounded-control px-3 text-sm ${i === idx ? "bg-accent/10 text-fg" : "text-gray-2"}`}>
                  <Icon name={it.icon} className={`h-4 w-4 ${i === idx ? "text-accent" : "text-dim"}`} />
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="mono truncate text-[11px] text-dim">{it.hint}</span>}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mono flex items-center gap-3 border-t border-line px-4 py-2 text-[10px] text-dim"><span>↑↓ move</span><span>enter run</span><span className="ml-auto">⌘K / Ctrl+K</span></p>
      </div>
    </div>,
    document.body,
  );
}
