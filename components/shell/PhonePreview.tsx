"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EVT } from "./nav";

type Msg = { id: string; direction: "in" | "out"; body: string; kind: string; status: string; createdAt: string };

const MAGENTA = "#E20074";
const clock = () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());
const time = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/**
 * The user's phone, on T-Mobile: Bluff's alerts and replies arrive here as a message thread, and the user can text Bluff
 * back (forward a suspicious message, or WATCH / DISPUTE / SAFE / STOP / HELP). Delivery is in-app.
 */
export function PhonePreview() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
  const [now, setNow] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    const o = () => setOpen(true);
    window.addEventListener(EVT.phone, o);
    return () => window.removeEventListener(EVT.phone, o);
  }, []);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/messages", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      setMsgs((await r.json()).messages);
      setErr(null);
    } catch { setErr("Couldn't load messages."); }
  }, []);

  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setNow(clock()); const t = setInterval(() => setNow(clock()), 30_000); return () => clearInterval(t); }, []);
  useEffect(() => { if (open) { setSeen(msgs.length); bottom.current?.scrollIntoView({ block: "end" }); } }, [open, msgs.length]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setText("");
    try {
      const r = await fetch("/api/demo/inbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) });
      if (!r.ok) throw new Error();
    } catch { setErr("Couldn't send. Try again."); }
    finally { setBusy(false); void load(); }
  }

  const unread = Math.max(0, msgs.filter((m) => m.direction === "out").length - msgs.slice(0, seen).filter((m) => m.direction === "out").length);

  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="phone-preview" aria-label="Phone preview (T-Mobile)"
        className="mono relative inline-flex min-h-[36px] items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-[12px] text-dim transition duration-ui hover:border-line2 hover:text-fg">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: MAGENTA }} />
        <span className="hidden sm:inline">Phone</span>
        {!open && unread > 0 && <span className="absolute -right-1 -top-1 rounded-full px-1.5 text-[10px] font-bold text-white" style={{ background: MAGENTA }}>{unread}</span>}
      </button>
      {open && mounted && createPortal(
        // Portaled to <body>: the sticky top bar uses backdrop-blur, which would otherwise trap this fixed panel inside it.
        <aside id="phone-preview" aria-label="Phone preview (T-Mobile)"
          className="fixed inset-x-3 bottom-24 z-[65] flex max-h-[75vh] flex-col overflow-hidden rounded-[28px] border-[6px] border-[#1b1b1f] bg-[#0b0b0d] text-white shadow-2xl sm:left-auto sm:right-4 sm:w-[360px] lg:bottom-4 xl:right-[336px]">
          <div className="flex items-center justify-between px-5 pb-1 pt-2 text-[12px] font-semibold">
            <span className="num">{now}</span>
            <span className="flex items-center gap-1.5"><span style={{ color: MAGENTA }}>T-Mobile</span> 5G
              <span aria-hidden className="ml-1 inline-block h-2.5 w-5 rounded-[3px] border border-white/70 p-[1px]"><span className="block h-full w-3/4 rounded-[1px] bg-white" /></span>
            </span>
          </div>
          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
            <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold" style={{ background: MAGENTA }}>B</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-tight">Bluff</p>
              <p className="text-[11px] text-white/60">Scam alerts · Messages</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close phone preview" className="min-h-[32px] min-w-[32px] text-white/60 hover:text-white">✕</button>
          </header>
          <div className="flex-1 space-y-2 overflow-y-auto bg-[#0b0b0d] p-3">
            {err && <p role="alert" className="text-xs text-red-400">{err}</p>}
            {msgs.length === 0 && <p className="py-8 text-center text-sm text-white/60">No messages yet. Bluff texts you here when it spots a risky site or charge. Forward a suspicious text below to check it.</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.direction === "in" ? "items-end" : "items-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "text-white" : "bg-[#26262b] text-white"}`} style={m.direction === "in" ? { background: MAGENTA } : undefined}>
                  {m.direction === "in" && m.body === "[discarded]" ? <em className="opacity-80">(message checked and discarded)</em> : m.body}
                  {m.status === "failed" && <p className="mt-1 text-[11px] text-red-300">Not delivered</p>}
                </div>
                <span className="mt-0.5 px-1 text-[10px] text-white/40">{time(m.createdAt)}</span>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-white/10 p-3">
            <label className="sr-only" htmlFor="pp-input">Text Bluff</label>
            <input id="pp-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Forward a text or type HELP" maxLength={2000}
              className="min-h-[40px] flex-1 rounded-full border border-white/15 bg-[#17171b] px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40" />
            <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold text-white disabled:opacity-40" style={{ background: MAGENTA }}>{busy ? "…" : "↑"}</button>
          </form>
        </aside>,
        document.body,
      )}
    </>
  );
}
