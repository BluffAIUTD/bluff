"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { useRunStream } from "@/lib/client/useRunStream";
import { money, shortDate } from "@/lib/format";
import type { Verdict } from "@/lib/schemas";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { ModeBadge } from "../ui/ModeBadge";
import { AgentTrace } from "../verdict/AgentTrace";
import { VerdictCard } from "../verdict/VerdictCard";

type Merchant = {
  key: string; merchant: string; host: string | null; descriptor: string; category: string | null;
  txns: { id: string; ts: string; amountCents: number }[]; totalCents: number;
  runId?: string; verdict?: (Verdict & { scannedAt?: string }) | null;
};
type Sync = { customer: { id: string; name: string }; accounts: { id: string; type: string; nickname: string; last4: string }[]; fetched: number; inserted: number };
type ScanResponse = { configured: boolean; sync: Sync | null; merchants: Merchant[] };

const toneOf = (v?: Verdict | null) => (!v ? "neutral" : v.verdict === "likely_scam" ? "scam" : v.verdict === "unsure" ? "unsure" : "safe") as "scam" | "unsure" | "safe" | "neutral";
const LABEL = { likely_scam: "Likely scam", unsure: "Unsure", looks_ok: "Looks OK" } as const;

export function ScanClient() {
  const [state, setState] = useState<ScanResponse | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [live, setLive] = useState<Record<string, Verdict>>({});
  const [doneKeys, setDoneKeys] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    api<ScanResponse>("/api/scan").then(setState).catch((e) => setLoadErr(e instanceof ApiFailure ? e.message : "Couldn't load your transactions."));
  }, []);

  const start = useCallback(async (fresh: boolean) => {
    setScanning(true); setScanErr(null); setLive({}); setDoneKeys(new Set()); setOpen(null);
    try {
      const r = await api<ScanResponse>(`/api/scan${fresh ? "?fresh=1" : ""}`, { method: "POST" });
      setState(r);
    } catch (e) {
      setScanErr(e instanceof ApiFailure ? e.message : "Couldn't start the scan.");
      setScanning(false);
    }
  }, []);

  const merchants = useMemo(() => state?.merchants ?? [], [state]);
  const running = merchants.some((m) => m.runId) && doneKeys.size < merchants.filter((m) => m.runId).length;
  useEffect(() => { if (scanning && merchants.some((m) => m.runId) && !running) setScanning(false); }, [scanning, running, merchants]);

  const verdictOf = useCallback((m: Merchant) => live[m.key] ?? m.verdict ?? null, [live]);
  const rows = useMemo(() => {
    if (running) return merchants;
    return [...merchants].sort((a, b) => (verdictOf(a)?.score ?? 101) - (verdictOf(b)?.score ?? 101));
  }, [merchants, running, verdictOf]);

  const counts = useMemo(() => {
    const c = { likely_scam: 0, unsure: 0, looks_ok: 0, atRisk: 0 };
    for (const m of merchants) {
      const v = verdictOf(m);
      if (!v) continue;
      c[v.verdict]++;
      if (v.verdict !== "looks_ok") c.atRisk += m.totalCents;
    }
    return c;
  }, [merchants, verdictOf]);

  const txnCount = merchants.reduce((n, m) => n + m.txns.length, 0);
  const scanned = merchants.filter((m) => verdictOf(m)).length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-grotesk text-3xl font-bold tracking-tight">Bank scan</h1>
          <p className="mt-1 text-dim">
            Bluff pulls your recent card transactions from Capital One, visits each merchant&apos;s website, and a Nemotron agent decides whether the site you paid looks like a scam.
          </p>
        </div>
        <div className="flex gap-2">
          {merchants.length > 0 && !scanning && <Button variant="secondary" onClick={() => start(true)}>Rescan everything</Button>}
          <Button onClick={() => start(false)} disabled={scanning || state?.configured === false}>{scanning ? "Scanning…" : merchants.length ? "Scan again" : "Scan my transactions"}</Button>
        </div>
      </header>

      {loadErr && <ErrorState title="Couldn't load the scan" message={loadErr} />}
      {state?.configured === false && <ErrorState title="Capital One isn't connected" message="Set NESSIE_API_KEY on the server, then run npm run nessie:seed." />}
      {scanErr && <ErrorState title="Scan didn't start" message={scanErr} />}

      <section aria-label="Connected account" className="grid gap-3 sm:grid-cols-4">
        <Stat label="Source" value="Capital One" hint={state?.sync ? `${state.sync.customer.name} · ${state.sync.accounts.map((a) => `${a.nickname} ••${a.last4}`).join(", ")}` : "Nessie API"} />
        <Stat label="Transactions" value={String(txnCount)} hint={`${merchants.length} merchants, last 45 days`} />
        <Stat label="Flagged" value={String(counts.likely_scam + counts.unsure)} hint={`${counts.likely_scam} likely scam · ${counts.unsure} unsure`} tone={counts.likely_scam ? "scam" : undefined} />
        <Stat label="Money at risk" value={money(counts.atRisk)} hint={scanned ? `${scanned}/${merchants.length} sites checked` : "Not scanned yet"} tone={counts.atRisk ? "scam" : undefined} />
      </section>

      {state && merchants.length === 0 && (
        <div className="rounded-card border border-line bg-surface p-6 text-dim">
          No bank transactions yet. Press <strong className="text-fg">Scan my transactions</strong> to pull them from Capital One.
        </div>
      )}

      <ul className="flex flex-col gap-3">
        {rows.map((m) => (
          <MerchantRow key={m.key} m={m} open={open === m.key} onToggle={() => setOpen(open === m.key ? null : m.key)}
            onVerdict={(v) => setLive((s) => ({ ...s, [m.key]: v }))}
            onDone={() => setDoneKeys((s) => new Set(s).add(m.key))} verdict={verdictOf(m)} />
        ))}
      </ul>

      <p className="text-xs text-dim">
        Bank data: Capital One Nessie sandbox (synthetic customer). Real merchants are fetched live from their public homepages; stores ending in <code>.example</code> are Bluff&apos;s labeled demo storefronts and are never fetched from the internet. Bluff only reads public pages and drafts disputes; it never contacts merchants or your bank.
      </p>
    </div>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "scam" }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-dim">{label}</div>
      <div className={`num mt-1 font-grotesk text-2xl font-bold ${tone === "scam" ? "text-scam" : ""}`}>{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-dim" title={hint}>{hint}</div>}
    </div>
  );
}

function MerchantRow({ m, verdict, open, onToggle, onVerdict, onDone }: {
  m: Merchant; verdict: Verdict | null; open: boolean; onToggle: () => void; onVerdict: (v: Verdict) => void; onDone: () => void;
}) {
  // Queued runs wait for a free agent slot, so allow longer than a single check before giving up.
  const s = useRunStream(m.runId ?? null, { giveUpMs: 240_000 });
  const v = s.verdict ?? verdict;
  // Report up once per change (callbacks are inline functions from the parent, intentionally not dependencies).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.verdict) onVerdict(s.verdict); }, [s.verdict]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (s.done || (s.error && !s.running)) onDone(); }, [s.done, s.error, s.running]);

  const status = s.running ? (s.steps.length ? (s.steps[s.steps.length - 1].tool ?? "planning") : "queued") : null;
  const latest = m.txns[0];
  const tone = toneOf(v);
  const border = tone === "scam" ? "border-scam/50" : tone === "unsure" ? "border-unsure/50" : "border-line";

  return (
    <li className={`overflow-hidden rounded-card border bg-surface ${border}`}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-left transition duration-ui hover:bg-surface2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{m.merchant}</span>
            {m.host && <span className="truncate font-mono text-xs text-dim">{m.host}</span>}
            {m.host?.endsWith(".example") && <Badge tone="neutral">Demo store</Badge>}
          </div>
          <div className="mt-0.5 text-xs text-dim">
            {m.txns.length} charge{m.txns.length === 1 ? "" : "s"} · {money(m.totalCents)} · latest {shortDate(latest.ts)} · <span className="font-mono">{m.descriptor}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {status && <span className="flex items-center gap-2 text-xs text-dim"><span aria-hidden className="skeleton inline-block h-2 w-2 rounded-full bg-accent" />{status === "queued" ? "Queued" : `Running ${status}`}</span>}
          {v && <Badge tone={tone === "neutral" ? "neutral" : tone}>{LABEL[v.verdict]} · {v.score}</Badge>}
          {v && <ModeBadge mode={v.mode} />}
          {!v && !status && <Badge>Not scanned</Badge>}
          <span aria-hidden className={`text-dim transition ${open ? "rotate-90" : ""}`}>›</span>
        </div>
      </button>
      {open && (
        <div className="flex flex-col gap-4 border-t border-line p-4">
          {m.runId && <AgentTrace steps={s.steps} running={s.running} totalMs={s.totalMs} slow={s.slow} label={`Agent trace · ${m.host ?? m.merchant}`} />}
          {s.error && <p role="status" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">AI check unavailable for this site, so this is a rules-only check over the real page.</p>}
          {v && (
            <VerdictCard verdict={v} subtitle={`${m.merchant} · ${m.host ?? "website unknown"}`}
              actions={
                <div className="flex flex-wrap gap-2">
                  <Link href={`/charges/${latest.id}`} className="rounded-control border border-line px-3 py-2 text-sm font-medium hover:bg-surface2">
                    {v.verdict === "looks_ok" ? "View charge" : "Dispute this charge"}
                  </Link>
                  {m.host && !m.host.endsWith(".example") && <a href={`https://${m.host}`} target="_blank" rel="noreferrer noopener" className="rounded-control px-3 py-2 text-sm text-dim underline">Open {m.host}</a>}
                </div>
              } />
          )}
          {!v && !m.runId && <p className="text-sm text-dim">Not scanned yet. Press Scan to check this site.</p>}
        </div>
      )}
    </li>
  );
}
