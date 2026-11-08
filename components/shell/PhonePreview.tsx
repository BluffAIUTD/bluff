"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Meta = Record<string, unknown>;
export type PhoneMsg = { id: string; direction: "in" | "out"; body: string; kind: string; status: string; createdAt: string; meta?: Meta };
type Hold = { held: boolean; since: string | null };
type InboxText = { id: string; sender: string; received: string; body: string };
type Tab = "bluff" | "messages";

const MAGENTA = "#E20074";
const clock = () => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date());
const time = (iso: string) => new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(iso));

/** Reply commands a chip may send. */
const CHIPS = ["DISPUTE", "HOLD", "UNHOLD", "SAFE", "WATCH", "START"];
const CHIP_HINT: Record<string, string> = {
  DISPUTE: "Draft a dispute for this charge (nothing is sent)", HOLD: "Safe Signal hold: decline new online charges (simulated)",
  UNHOLD: "Lift the Safe Signal hold", SAFE: "You recognize it: stop flagging this site", WATCH: "Watch your charges for this site", START: "Resume alerts",
};

/** Reply chips for one of Bluff's messages: meta.actions, else inferred for older alerts (charge → DISPUTE, exposure → WATCH). */
export function actionsFor(m: PhoneMsg, hold?: Hold | null): string[] {
  if (m.direction !== "out") return [];
  const meta = m.meta ?? {};
  let a: string[] = Array.isArray(meta.actions) ? meta.actions.filter((x): x is string => typeof x === "string" && CHIPS.includes(x))
    : m.kind !== "alert" ? []
    : typeof meta.txn_id === "string" ? ["DISPUTE", "HOLD", "SAFE"]
    : typeof meta.exposure_id === "string" ? ["WATCH", "SAFE"] : [];
  if (hold?.held) a = a.map((x) => (x === "HOLD" ? "UNHOLD" : x));
  return a;
}

/** Id of the newest Bluff message that offers reply chips (chips show under that one only). */
export function chipTargetId(msgs: PhoneMsg[]): string | null {
  for (let i = msgs.length - 1; i >= 0; i--) if (actionsFor(msgs[i]).length) return msgs[i].id;
  return null;
}

/** Bluff messages newer than the last time the thread was open (all of them on a first visit). */
export function unreadCount(msgs: PhoneMsg[], seenAt: string | null): number {
  return msgs.filter((m) => m.direction === "out" && (!seenAt || m.createdAt > seenAt)).length;
}

const store = {
  get(k: string): string | null { try { return window.localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { window.localStorage.setItem(k, v); } catch { /* private mode */ } },
};

/**
 * The user's phone, on T-Mobile: Bluff's alerts and replies arrive in the Bluff thread (with reply chips such as DISPUTE,
 * HOLD, SAFE), and the Messages tab is an inbox of synthetic incoming texts the user can report to Bluff, like forwarding spam
 * to a carrier short code. Delivery is in-app; no SMS gateway is connected.
 */
export function PhonePreview() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("bluff");
  const [msgs, setMsgs] = useState<PhoneMsg[]>([]);
  const [hold, setHold] = useState<Hold | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seenAt, setSeenAt] = useState<string | null>(null);
  const [now, setNow] = useState("");
  const [mounted, setMounted] = useState(false);
  const [inbox, setInbox] = useState<InboxText[] | null>(null);
  const [inboxErr, setInboxErr] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [reported, setReported] = useState<string[]>([]);
  const [peek, setPeek] = useState<PhoneMsg | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastOut = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    setMounted(true);
    setSeenAt(store.get("bluff:phone:seenAt"));
    try { setReported(JSON.parse(store.get("bluff:phone:reported") ?? "[]")); } catch { /* ignore */ }
  }, []);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/messages", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json() as { messages: PhoneMsg[]; hold?: Hold };
      setMsgs(data.messages);
      setHold(data.hold ?? null);
      setErr(null);
      setLoaded(true);
    } catch { setErr("Couldn't load messages."); }
  }, []);

  useEffect(() => { void load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  useEffect(() => { setNow(clock()); const t = setInterval(() => setNow(clock()), 30_000); return () => clearInterval(t); }, []);

  // A new alert while the phone is closed peeks in like a notification (never on first load).
  useEffect(() => {
    if (!loaded) return;
    const out = msgs.filter((m) => m.direction === "out");
    const newest = out[out.length - 1] ?? null;
    if (lastOut.current === undefined) { lastOut.current = newest?.id ?? null; return; }
    if (newest && newest.id !== lastOut.current) {
      lastOut.current = newest.id;
      if (!open && newest.kind === "alert") setPeek(newest);
    }
  }, [msgs, open, loaded]);
  useEffect(() => { if (!peek) return; const t = setTimeout(() => setPeek(null), 8000); return () => clearTimeout(t); }, [peek]);

  useEffect(() => {
    if (!open || tab !== "bluff") return;
    setPeek(null);
    const latest = msgs[msgs.length - 1]?.createdAt;
    if (latest && latest !== seenAt) { setSeenAt(latest); store.set("bluff:phone:seenAt", latest); }
    bottom.current?.scrollIntoView({ block: "end" });
  }, [open, tab, msgs, seenAt, checking]);

  useEffect(() => {
    if (!open || tab !== "messages" || inbox) return;
    fetch("/api/demo/scam-text", { cache: "no-store" })
      .then(async (r) => { if (!r.ok) throw new Error(); setInbox((await r.json()).texts); setInboxErr(false); })
      .catch(() => setInboxErr(true));
  }, [open, tab, inbox]);

  async function sendText(body: string) {
    if (!body || busy) return;
    setBusy(true);
    try {
      const r = await fetch("/api/demo/inbound", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: body }) });
      if (!r.ok) throw new Error();
    } catch { setErr("Couldn't send. Try again."); }
    finally { setBusy(false); void load(); }
  }

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setText("");
    await sendText(body);
  }

  async function report(id: string) {
    if (busy) return;
    setBusy(true); setChecking(true); setTab("bluff"); setReading(null);
    const next = [...new Set([...reported, id])];
    setReported(next); store.set("bluff:phone:reported", JSON.stringify(next));
    try {
      const r = await fetch("/api/demo/scam-text", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) });
      if (!r.ok) throw new Error();
    } catch { setErr("Couldn't report that text. Try again."); }
    finally { setBusy(false); setChecking(false); void load(); }
  }

  const unread = unreadCount(msgs, seenAt);
  const chipId = chipTargetId(msgs);
  const openText = inbox?.find((t) => t.id === reading) ?? null;

  return (
    <>
      <button type="button" onClick={() => { setOpen((o) => !o); setPeek(null); }} aria-expanded={open} aria-controls="phone-preview"
        aria-label={`Phone preview: T-Mobile alerts${!open && unread > 0 ? `, ${unread} unread` : ""}`}
        className="relative inline-flex min-h-[44px] items-center gap-2 rounded-control border border-line px-3 text-sm font-medium text-dim hover:text-fg">
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: MAGENTA }} />
        T-Mobile alerts
        {!open && unread > 0 && <span aria-hidden className="absolute -right-1 -top-1 min-w-[18px] rounded-full px-1.5 text-center text-[10px] font-bold leading-[18px] text-white" style={{ background: MAGENTA }}>{unread > 99 ? "99+" : unread}</span>}
      </button>

      {peek && !open && mounted && createPortal(
        <div role="status" className="fixed inset-x-3 bottom-20 z-40 sm:left-auto sm:right-4 sm:w-[340px] lg:bottom-4">
          <button type="button" onClick={() => { setOpen(true); setTab("bluff"); setPeek(null); }}
            className="flex w-full items-start gap-3 rounded-2xl border border-white/10 bg-[#1b1b1f] p-3 text-left text-white shadow-2xl">
            <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full font-grotesk text-sm font-bold" style={{ background: MAGENTA }}>B</span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-white/60">New T-Mobile alert from Bluff</span>
              <span className="line-clamp-2 break-words text-sm">{peek.body}</span>
            </span>
          </button>
        </div>,
        document.body,
      )}

      {open && mounted && createPortal(
        // Portaled to <body>: the sticky top bar uses backdrop-blur, which would otherwise trap this fixed panel inside it.
        <aside id="phone-preview" aria-label="Phone preview (T-Mobile)"
          className="fixed inset-x-3 bottom-20 z-40 flex max-h-[75vh] flex-col overflow-hidden rounded-[28px] border-[6px] border-[#1b1b1f] bg-[#0b0b0d] text-white shadow-2xl sm:left-auto sm:right-4 sm:w-[360px] lg:bottom-4">
          <div className="flex items-center justify-between px-5 pb-1 pt-2 text-[12px] font-semibold">
            <span className="num">{now}</span>
            <span className="flex items-center gap-1.5"><span style={{ color: MAGENTA }}>T-Mobile</span> 5G
              <span aria-hidden className="ml-1 inline-block h-2.5 w-5 rounded-[3px] border border-white/70 p-[1px]"><span className="block h-full w-3/4 rounded-[1px] bg-white" /></span>
            </span>
          </div>

          {hold?.held && (
            <div role="status" className="flex items-center gap-2 border-y border-white/10 px-4 py-2 text-[12px]" style={{ background: "rgba(226,0,116,0.16)" }}>
              <span aria-hidden>⏸</span>
              <p className="min-w-0 flex-1 leading-snug"><span className="font-semibold">Safe Signal hold on</span> (simulated){hold.since ? ` since ${time(hold.since)}` : ""}. New test purchases are declined.</p>
              <button type="button" onClick={() => void sendText("UNHOLD")} disabled={busy} className="min-h-[32px] shrink-0 rounded-full border border-white/30 px-3 font-semibold hover:bg-white/10 disabled:opacity-40">Lift</button>
            </div>
          )}

          <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
            {tab === "messages" && openText ? (
              <button type="button" onClick={() => setReading(null)} className="min-h-[32px] pr-1 text-sm font-semibold" style={{ color: MAGENTA }} aria-label="Back to Messages">‹</button>
            ) : (
              <span aria-hidden className="grid h-9 w-9 place-items-center rounded-full font-grotesk text-sm font-bold" style={{ background: tab === "bluff" ? MAGENTA : "#3a3a40" }}>{tab === "bluff" ? "B" : "✉"}</span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-grotesk text-sm font-semibold leading-tight">{tab === "bluff" ? "Bluff" : openText ? openText.sender : "Messages"}</p>
              <p className="text-[11px] text-white/60">{tab === "bluff" ? "Scam alerts · replies" : openText ? `Received ${openText.received}` : "Inbox · synthetic sample texts"}</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close phone preview" className="min-h-[32px] min-w-[32px] text-white/60 hover:text-white">✕</button>
          </header>

          <div role="tablist" aria-label="Phone apps" className="grid grid-cols-2 border-b border-white/10 text-[13px] font-semibold">
            {(["bluff", "messages"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => { setTab(t); if (t === "messages") setReading(null); }}
                className={`min-h-[40px] ${tab === t ? "text-white" : "text-white/50 hover:text-white/80"}`} style={tab === t ? { boxShadow: `inset 0 -2px 0 ${MAGENTA}` } : undefined}>
                {t === "bluff" ? <>Bluff{unread > 0 && tab !== "bluff" ? ` (${unread})` : ""}</> : "Messages"}
              </button>
            ))}
          </div>

          {tab === "bluff" ? (
            <>
              <div className="flex-1 space-y-2 overflow-y-auto bg-[#0b0b0d] p-3">
                {err && <p role="alert" className="text-xs text-red-400">{err}</p>}
                {msgs.length === 0 && <p className="py-8 text-center text-sm text-white/60">No messages yet. Bluff texts you here when it spots a risky site or charge. Report a text from Messages, or forward one below.</p>}
                {msgs.map((m) => {
                  const chips = m.id === chipId ? actionsFor(m, hold) : [];
                  return (
                    <div key={m.id} className={`flex flex-col ${m.direction === "in" ? "items-end" : "items-start"}`}>
                      <div className={`max-w-[85%] whitespace-pre-line break-words rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "text-white" : "bg-[#26262b] text-white"}`} style={m.direction === "in" ? { background: MAGENTA } : undefined}>
                        {m.direction === "in" && m.body === "[discarded]" ? <em className="opacity-80">{m.meta?.reported ? "(reported text checked and discarded)" : "(message checked and discarded)"}</em> : m.body}
                        {m.status === "failed" && <p className="mt-1 text-[11px] text-red-300">Not delivered</p>}
                      </div>
                      {chips.length > 0 && (
                        <div role="group" aria-label="Quick replies" className="mt-1.5 flex max-w-full flex-wrap gap-1.5">
                          {chips.map((c) => (
                            <button key={c} type="button" title={CHIP_HINT[c]} disabled={busy} onClick={() => void sendText(c)}
                              className="min-h-[32px] rounded-full border px-3 text-[12px] font-bold tracking-wide disabled:opacity-40" style={{ borderColor: MAGENTA, color: "#ff7ac0" }}>
                              {c}
                            </button>
                          ))}
                        </div>
                      )}
                      <span className="mt-0.5 px-1 text-[10px] text-white/40">{time(m.createdAt)}</span>
                    </div>
                  );
                })}
                {checking && <div className="flex items-start"><p aria-live="polite" className="rounded-2xl bg-[#26262b] px-3 py-2 text-sm text-white/70">Bluff is checking the text…</p></div>}
                <div ref={bottom} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); void send(); }} className="flex gap-2 border-t border-white/10 p-3">
                <label className="sr-only" htmlFor="pp-input">Text Bluff</label>
                <input id="pp-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Forward a text or type HELP" maxLength={2000}
                  className="min-h-[40px] min-w-0 flex-1 rounded-full border border-white/15 bg-[#17171b] px-4 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/40" />
                <button type="submit" disabled={busy || !text.trim()} aria-label="Send"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full font-bold text-white disabled:opacity-40" style={{ background: MAGENTA }}>{busy ? "…" : "↑"}</button>
              </form>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto bg-[#0b0b0d]">
              {inboxErr && <p role="alert" className="p-3 text-xs text-red-400">Couldn&apos;t load the inbox.</p>}
              {!inbox && !inboxErr && <p className="p-6 text-center text-sm text-white/60">Loading…</p>}
              {inbox && !openText && (
                <>
                  <p className="px-4 pb-1 pt-3 text-[11px] text-white/50">Synthetic sample texts. Open one and report it to Bluff if it looks like a scam, like forwarding spam to your carrier.</p>
                  <ul className="divide-y divide-white/10">
                    {inbox.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setReading(t.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-white/5">
                          <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#3a3a40] text-sm font-semibold">{/^\d+$/.test(t.sender) ? "#" : t.sender.replace(/\D/g, "").slice(-2)}</span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline justify-between gap-2">
                              <span className="truncate text-sm font-semibold">{t.sender}</span>
                              <span className="shrink-0 text-[11px] text-white/40">{t.received}</span>
                            </span>
                            <span className="line-clamp-2 break-words text-[13px] text-white/70">{t.body}</span>
                            {reported.includes(t.id) && <span className="mt-1 inline-block rounded-full px-2 text-[10px] font-semibold" style={{ background: "rgba(226,0,116,0.2)", color: "#ff7ac0" }}>Reported to Bluff</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {openText && (
                <div className="flex flex-col gap-3 p-3">
                  <div className="flex flex-col items-start">
                    {/* Plain text on purpose: links in a suspicious text are never made tappable here. */}
                    <p className="max-w-[90%] whitespace-pre-line break-words rounded-2xl bg-[#26262b] px-3 py-2 text-sm">{openText.body}</p>
                    <span className="mt-0.5 px-1 text-[10px] text-white/40">{openText.received}</span>
                  </div>
                  {reported.includes(openText.id) ? (
                    <button type="button" onClick={() => setTab("bluff")} className="min-h-[44px] rounded-full border border-white/20 text-sm font-semibold">Reported. See Bluff&apos;s reply</button>
                  ) : (
                    <button type="button" onClick={() => void report(openText.id)} disabled={busy} className="min-h-[44px] rounded-full text-sm font-bold text-white disabled:opacity-40" style={{ background: MAGENTA }}>Report to Bluff</button>
                  )}
                  <p className="text-[11px] leading-snug text-white/50">Bluff checks the text, replies in the Bluff thread, then discards it. It keeps only the verdict and, for a scam with a link, the link&apos;s website, so a later charge from it can be matched. The sender&apos;s number is never stored (at most a one-way hash).</p>
                </div>
              )}
            </div>
          )}
        </aside>,
        document.body,
      )}
    </>
  );
}
