"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";

type Msg = { id: string; direction: "in" | "out"; body: string; kind: string; status: string; createdAt: string };

/** Mock phone: shows Bluff Text messages and lets you text Bluff as the demo user (also an on-screen backup during judging). */
export function PhonePreview() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seen, setSeen] = useState(0);
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
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="phone-preview"
        className="relative min-h-[44px] rounded-control border border-line px-3 text-sm font-medium text-dim hover:text-fg">
        Phone preview
        {!open && unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-scam px-1.5 text-[10px] font-bold text-white">{unread}</span>}
      </button>
      {open && (
        <aside id="phone-preview" aria-label="Phone preview" className="fixed inset-x-3 bottom-20 z-40 flex max-h-[70vh] flex-col overflow-hidden rounded-card border border-line bg-surface shadow-2xl sm:left-auto sm:right-4 sm:w-[360px] lg:bottom-4">
          <header className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="font-grotesk font-medium">Bluff Text <span className="text-xs text-dim">(iMessage preview)</span></p>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close phone preview" className="min-h-[32px] min-w-[32px] text-dim hover:text-fg">✕</button>
          </header>
          <div className="flex-1 space-y-2 overflow-y-auto p-3">
            {err && <p role="alert" className="text-xs text-scam">{err}</p>}
            {msgs.length === 0 && <p className="py-8 text-center text-sm text-dim">No messages yet. Check a store, or text Bluff below.</p>}
            {msgs.map((m) => (
              <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "bg-accent text-white" : "bg-surface2"}`}>
                  {m.direction === "in" && m.body === "[discarded]" ? <em className="opacity-80">(message checked and discarded)</em> : m.body}
                  {m.status === "failed" && <p className="mt-1 text-[11px] text-scam">Text not delivered</p>}
                </div>
              </div>
            ))}
            <div ref={bottom} />
          </div>
          <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-line p-3">
            <label className="sr-only" htmlFor="pp-input">Text Bluff</label>
            <input id="pp-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Forward a text or type HELP" maxLength={2000}
              className="min-h-[44px] flex-1 rounded-control border border-line bg-bg px-3 text-sm outline-none focus:border-accent" />
            <Button type="submit" disabled={busy || !text.trim()}>{busy ? "…" : "Send"}</Button>
          </form>
        </aside>
      )}
    </>
  );
}
