"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { money } from "@/lib/format";
import type { StepEvent, Verdict } from "@/lib/schemas";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { LivePush, type PushResponse } from "./LivePush";
import { ScanDetail } from "./ScanDetail";
import { ago, headline, LABEL, toneOf, type BasicPayload, type MerchantView, type PageLite, type Phase } from "./types";
import { useCardWatch, type WatchResponse } from "./useCardWatch";

type StateResponse = {
  merchants: (Omit<MerchantView, "phase" | "pagesSeen" | "steps" | "deep"> & { deep: { verdict: Verdict; runId: string | null } | null })[];
  deepAvailable: boolean; configured: boolean; account: { name: string; nickname: string } | null; lastSyncAt?: string | null;
};
type SyncInfo = { customer: { name: string }; accounts: { nickname: string; last4: string; type: string }[]; fetched: number; inserted: number; removed: number; checkedAt?: string } | null;
type MerchantsEvent = { sync: SyncInfo; syncError?: string; merchants: MerchantView[]; deepAvailable: boolean; partial?: boolean; reason?: string; newTxnIds?: string[] };

const PHASE_TEXT: Record<Phase, string> = { idle: "", queued: "Queued", resolving: "Finding website", crawling: "Crawling site", deep: "Nemotron reviewing", done: "", error: "Failed" };

function Dot({ tone }: { tone: string }) {
  const c = tone === "scam" ? "bg-scam" : tone === "unsure" ? "bg-unsure" : tone === "safe" ? "bg-safe" : "bg-gray-500";
  return <span aria-hidden className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${c}`} />;
}
function MiniScore({ who, v, pending }: { who: string; v?: { score: number; verdict: string } | null; pending?: boolean }) {
  const tone = toneOf(v?.verdict);
  const cls = tone === "scam" ? "text-scam border-scam/40 bg-scam/10" : tone === "unsure" ? "text-unsure border-unsure/40 bg-unsure/10" : tone === "safe" ? "text-safe border-safe/40 bg-safe/10" : "text-dim border-line";
  return <span className={`num inline-flex min-w-[54px] shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${cls}`}>{who}{" "}{v ? v.score : pending ? <span className="skeleton inline-block h-2 w-3" /> : "–"}</span>;
}

const fromState = (s: StateResponse): MerchantView[] =>
  s.merchants.map((m) => ({ ...m, phase: m.basic ? "done" : "idle", pagesSeen: [], steps: [], deep: m.deep ? { verdict: m.deep.verdict, mode: m.deep.verdict.mode, runId: m.deep.runId } : null }));

export function ScanClient({ push, demo }: { push?: string | null; demo?: boolean }) {
  const [items, setItems] = useState<MerchantView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [deepAvailable, setDeepAvailable] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [t0, setT0] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [watching, setWatching] = useState(true);
  const [now, setNow] = useState(() => Date.now());
  const [lastPushTxn, setLastPushTxn] = useState<string | null>(null);
  const streams = useRef(new Map<string, EventSource>());

  const loadState = useCallback(() => api<StateResponse>("/api/scan").then((s) => {
    setDeepAvailable(s.deepAvailable); setConfigured(s.configured);
    if (s.account) setAccount(`${s.account.name} · ${s.account.nickname}`);
    // Keep NEW markers and any row a live scan is still streaming (even if this state was read just before it arrived).
    setItems((xs) => {
      const live = new Map(xs.filter((m) => m.isNew || (m.phase !== "idle" && m.phase !== "done")).map((m) => [m.key, m]));
      const next = fromState(s).map((m) => live.get(m.key) ?? m);
      return [...[...live.values()].filter((m) => !next.some((x) => x.key === m.key)), ...next];
    });
  }), []);

  useEffect(() => {
    const open = streams.current;
    loadState().catch((e) => setErr(e instanceof ApiFailure ? e.message : "Couldn't load your transactions.")).finally(() => setLoading(false));
    return () => { for (const es of open.values()) es.close(); open.clear(); };
  }, [loadState]);

  useEffect(() => {
    if (!scanning || !t0) return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    return () => clearInterval(t);
  }, [scanning, t0]);

  const patch = useCallback((key: string, f: (m: MerchantView) => MerchantView) => setItems((xs) => xs.map((m) => (m.key === key ? f(m) : m))), []);

  /** Stream one scan. A full scan replaces the list; a partial one (live push, card watcher) merges its rows on top. */
  const attach = useCallback((scanId: string, partial: boolean) => {
    streams.current.get(scanId)?.close();
    const es = new EventSource(`/api/scan/${scanId}/stream`);
    streams.current.set(scanId, es);
    const close = () => { es.close(); streams.current.delete(scanId); if (!partial) setScanning(false); };
    const on = <T,>(type: string, fn: (d: T) => void) => es.addEventListener(type, (ev) => { try { fn(JSON.parse((ev as MessageEvent).data)); } catch { /* ignore */ } });
    on<MerchantsEvent>("merchants", (d) => {
      setDeepAvailable(d.deepAvailable);
      if (d.sync) { const a = d.sync.accounts.find((x) => x.type === "Credit Card") ?? d.sync.accounts[0]; setAccount(`${d.sync.customer.name} · ${a ? `${a.nickname} ••${a.last4}` : ""}`); }
      if (d.syncError) setNotice(d.syncError);
      const fresh = (m: MerchantView): MerchantView => ({ ...m, phase: "queued", pagesSeen: [], basic: null, deep: null, steps: [] });
      if (d.partial) {
        const at = Date.now();
        const incoming = d.merchants.map((m) => ({ ...fresh(m), isNew: true, newAt: at, newTxnIds: (d.newTxnIds ?? []).filter((id) => m.txns.some((t) => t.id === id)) }));
        const keys = new Set(incoming.map((m) => m.key));
        setItems((xs) => [...incoming, ...xs.filter((m) => !keys.has(m.key))]);
        if (incoming[0]) setSelected(incoming[0].key);
      } else {
        setItems((xs) => {
          const marks = new Map(xs.filter((m) => m.isNew).map((m) => [m.key, m]));
          return d.merchants.map((m) => { const k = marks.get(m.key); return { ...fresh(m), ...(k ? { isNew: true, newAt: k.newAt, newTxnIds: k.newTxnIds } : {}) }; });
        });
      }
    });
    on<{ key: string; phase: Phase; detail?: string }>("status", (d) => patch(d.key, (m) => ({ ...m, phase: d.phase, detail: d.detail })));
    on<{ key: string; page: PageLite }>("page", (d) => patch(d.key, (m) => ({ ...m, pagesSeen: [...m.pagesSeen, d.page] })));
    on<BasicPayload>("basic", (d) => patch(d.key, (m) => ({ ...m, basic: d })));
    on<{ key: string; runId: string; step: StepEvent }>("deep_step", (d) => patch(d.key, (m) => ({ ...m, steps: [...m.steps, d.step] })));
    on<{ key: string; runId: string; verdict: Verdict | null; mode: string; error?: string }>("deep", (d) => patch(d.key, (m) => ({ ...m, deep: { verdict: d.verdict, mode: d.mode, error: d.error, runId: d.runId } })));
    on("done", close);
    es.addEventListener("error", () => { if (es.readyState === EventSource.CLOSED) close(); });
  }, [patch]);

  const start = useCallback(async (fresh: boolean) => {
    setErr(null); setNotice(null);
    let scanId: string;
    try { scanId = (await api<{ scanId: string }>(`/api/scan${fresh ? "?fresh=1" : ""}`, { method: "POST" })).scanId; }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't start the scan."); return; }
    setScanning(true); setT0(Date.now()); setElapsed(0);
    attach(scanId, false);
  }, [attach]);

  // ---- actively watching the card ----
  const onWatch = useCallback((r: WatchResponse) => {
    if (r.scanId) attach(r.scanId, true);
    else if (r.imported > 0) void loadState().catch(() => {});
  }, [attach, loadState]);
  const watch = useCardWatch(watching && !scanning, onWatch);
  useEffect(() => {
    if (!watching) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [watching]);

  const onPushed = useCallback((r: PushResponse) => { setLastPushTxn(r.txnId); attach(r.scanId, true); }, [attach]);

  const ranked = useMemo(() => {
    const rank = (m: MerchantView) => headline(m)?.score ?? 101;
    const fresh = items.filter((m) => m.isNew).sort((a, b) => (b.newAt ?? 0) - (a.newAt ?? 0));
    const rest = items.filter((m) => !m.isNew);
    return [...fresh, ...(scanning ? rest : [...rest].sort((a, b) => rank(a) - rank(b)))];
  }, [items, scanning]);
  useEffect(() => { if (!selected && ranked.length && !scanning && ranked[0].basic) setSelected(ranked[0].key); }, [ranked, selected, scanning]);

  const stats = useMemo(() => {
    let scam = 0, unsure = 0, risk = 0, crawled = 0, deepDone = 0, aiLive = 0;
    for (const m of items) {
      const v = headline(m);
      if (m.basic) crawled++;
      if (m.deep) deepDone++;
      if (m.deep?.mode === "live" || m.deep?.mode === "cached") aiLive++;
      if (v?.verdict === "likely_scam") { scam++; risk += m.totalCents; }
      else if (v?.verdict === "unsure") { unsure++; risk += m.totalCents; }
    }
    return { scam, unsure, risk, crawled, deepDone, aiLive, txns: items.reduce((n, m) => n + m.txns.length, 0) };
  }, [items]);

  const current = items.find((m) => m.key === selected) ?? null;
  const tracked = lastPushTxn ? items.find((m) => m.txns.some((t) => t.id === lastPushTxn)) ?? null : null;
  const pct = (n: number) => (items.length ? Math.round((n / items.length) * 100) : 0);
  const nessieOn = configured && watch.configured;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-dim">
              <span className="h-1.5 w-1.5 rounded-full bg-safe" /> Capital One {account ? `· ${account}` : "· Nessie API"}
            </p>
            {nessieOn && (
              <button type="button" onClick={() => setWatching((w) => !w)} aria-pressed={watching}
                title={watching ? "Bluff checks Capital One for new charges every 20 s while this page is open. Click to pause." : "Click to resume watching for new charges."}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition duration-ui ${watching ? "border-safe/40 bg-safe/10 text-fg" : "border-line bg-surface text-dim hover:text-fg"}`}>
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${watching ? "animate-pulse bg-safe" : "bg-gray-500"}`} />
                {watching ? "Watching your card" : "Watching paused"}
                <span className="text-dim">{watching ? (scanning ? "· paused during scan" : watch.checkedAt ? `· last checked ${ago(watch.checkedAt, now)}` : "· checking…") : "· resume"}</span>
              </button>
            )}
          </div>
          <h1 className="font-grotesk text-3xl font-bold tracking-tight sm:text-4xl">Who did you really pay?</h1>
          <p className="mt-1 text-dim">Bluff checks the website behind every charge on your card. Rules give an instant read; an NVIDIA Nemotron agent reads the pages for what rules miss.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.some((m) => m.basic) && !scanning && <Button variant="secondary" onClick={() => start(true)}>Re-crawl everything</Button>}
          <Button onClick={() => start(false)} disabled={scanning || !configured}>{scanning ? `Scanning… ${elapsed}s` : items.some((m) => m.basic) ? "Scan again" : "Scan my transactions"}</Button>
        </div>
      </header>

      <LivePush initialPreset={push} defaultOpen={demo} disabled={!configured} tracked={tracked} onPushed={onPushed} />

      {err && <ErrorState title="Scan problem" message={err} />}
      {notice && <p role="status" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">{notice}</p>}
      {watching && watch.error && <p role="status" className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-dim">{watch.error}</p>}
      {!configured && <p role="status" className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-dim">Capital One isn&apos;t connected on this server (NESSIE_API_KEY). Showing transactions already imported.</p>}
      {!deepAvailable && <p role="status" className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-dim">Deep analysis is off (no Nemotron key). You&apos;ll get the basic check only.</p>}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Transactions", String(stats.txns), `${items.length} merchants · last 45 days`, ""], ["Likely scams", String(stats.scam), `${stats.unsure} more unsure`, stats.scam ? "text-scam" : ""],
          ["Money at risk", money(stats.risk), "on flagged or unsure sites", stats.risk ? "text-scam" : ""], ["Sites analyzed", `${stats.crawled}/${items.length}`, `${stats.aiLive} reviewed by Nemotron${stats.deepDone > stats.aiLive ? ` · ${stats.deepDone - stats.aiLive} basic only` : ""}`, ""]].map(([l, v, h, c]) => (
          <div key={l} className="rounded-card border border-line bg-surface p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-dim">{l}</div>
            <div className={`num mt-1 font-grotesk text-2xl font-bold ${c}`}>{v}</div>
            <div className="mt-0.5 truncate text-xs text-dim">{h}</div>
          </div>
        ))}
      </section>

      {scanning && (
        <section aria-label="Progress" className="grid gap-2 rounded-card border border-line bg-surface p-4 sm:grid-cols-2">
          {[["Basic check (crawl + rules)", stats.crawled, "bg-accent"], ["Deep analysis (Nemotron)", stats.deepDone, "bg-safe"]].map(([l, n, c]) => (
            <div key={l as string}>
              <div className="mb-1 flex justify-between text-xs text-dim"><span>{l}</span><span className="num">{n}/{items.length}</span></div>
              <div className="h-2 overflow-hidden rounded-full bg-surface2"><div className={`h-full rounded-full transition-all duration-500 ${c}`} style={{ width: `${pct(n as number)}%` }} /></div>
            </div>
          ))}
        </section>
      )}

      {loading && <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-14 w-full" />)}</div>}
      {!loading && !items.length && (
        <div className="rounded-card border border-line bg-surface p-8 text-center">
          <p className="font-grotesk text-xl font-semibold">No transactions yet</p>
          <p className="mt-1 text-dim">Press <strong className="text-fg">Scan my transactions</strong> to import them from Capital One and check every merchant.</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <ul aria-label="Merchants" className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
            {ranked.map((m) => {
              const v = headline(m);
              const tone = toneOf(v?.verdict);
              const on = m.key === selected;
              const busy = m.phase === "queued" || m.phase === "resolving" || m.phase === "crawling" || m.phase === "deep";
              const deepV = m.deep?.verdict && (m.deep.mode === "live" || m.deep.mode === "cached") ? m.deep.verdict : null;
              return (
                <li key={m.key}>
                  <button type="button" onClick={() => setSelected(m.key)} aria-current={on ? "true" : undefined}
                    className={`flex w-full flex-col gap-1.5 rounded-card border px-3 py-2.5 text-left transition duration-ui ${on ? "border-accent bg-accent/10" : tone === "scam" ? "border-scam/40 bg-surface hover:bg-surface2" : "border-line bg-surface hover:bg-surface2"}`}>
                    <div className="flex items-center gap-2">
                      <Dot tone={tone} />
                      <span className="min-w-0 flex-1 truncate font-medium">{m.merchant}</span>
                      {m.isNew && <Badge tone="accent" title="New charge on your card">NEW</Badge>}
                      <span className="num text-sm">{money(m.totalCents)}</span>
                    </div>
                    <div className="flex w-full min-w-0 items-center gap-2 pl-[18px]">
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-dim">{busy ? `${PHASE_TEXT[m.phase]}${m.phase === "crawling" && m.pagesSeen.length ? ` · ${m.pagesSeen.length} pages` : ""}…` : m.host ?? "no website"}</span>
                      <MiniScore who="Rules" v={m.basic ? { score: m.basic.report.score, verdict: m.basic.report.label } : null} pending={busy && !m.basic} />
                      <MiniScore who="AI" v={deepV} pending={busy || (scanning && !m.deep)} />
                    </div>
                    {v && !busy && <span className={`pl-[18px] text-xs font-medium ${tone === "scam" ? "text-scam" : tone === "unsure" ? "text-unsure" : "text-safe"}`}>{LABEL[v.verdict]} · {m.txns.length} charge{m.txns.length === 1 ? "" : "s"}</span>}
                  </button>
                  {on && <div className="mt-3 lg:hidden"><ScanDetail m={m} /></div>}
                </li>
              );
            })}
          </ul>
          <div className="hidden min-w-0 lg:block">
            {current ? <ScanDetail m={current} /> : <div className="rounded-card border border-dashed border-line p-10 text-center text-dim">Pick a merchant to see what Bluff found.</div>}
          </div>
        </div>
      )}

      <p className="text-xs text-dim">
        Bank data: Capital One Nessie sandbox (synthetic customer and test card). Test purchases you make here are real Nessie sandbox records, visible only to your session in Bluff. Real merchants and public demo shops are crawled live (robots.txt obeyed, public addresses only). Scam-pattern stores are Bluff&apos;s own labeled demo websites. Bluff reads public pages and drafts disputes; it never contacts merchants or moves money.
      </p>
    </div>
  );
}
