"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { money, shortDate } from "@/lib/format";
import type { StepEvent } from "@/lib/schemas";
import { ModeBadge } from "../ui/ModeBadge";
import { AgentTrace } from "../verdict/AgentTrace";
import { ScoreDial } from "../verdict/ScoreDial";
import { LABEL, linkText, pageUrl, toneOf, type MerchantView } from "./types";

type SiteDetail = {
  pages: { url: string; path: string; type: string; title: string; words: number; status: number; emails: string[]; phones: string[]; payments: string[]; policy: { id: string; quote: string }[]; forms: string[] }[];
  crawl: { origin: string; robots: boolean; sitemapUrls: number; ms: number; skippedByRobots: string[]; robotsHidden?: number; rendered?: number; failed: { url: string; error: string }[] };
  trace: StepEvent[];
};

const SEV: Record<string, { dot: string; label: string }> = {
  high: { dot: "bg-scam", label: "High risk" }, medium: { dot: "bg-unsure", label: "Medium" }, low: { dot: "bg-gray-400", label: "Low" },
  good: { dot: "bg-safe", label: "Good sign" }, info: { dot: "bg-accent", label: "Note" },
};
const fmtAge = (d: number | null) => (d == null ? "unknown" : d < 365 ? `${d} days` : `${Math.floor(d / 365)} years`);

function Finding({ f, origin }: { f: { title: string; detail?: string; severity: string; page?: string }; origin?: string }) {
  const href = pageUrl(origin, f.page);
  const s = SEV[f.severity] ?? SEV.info;
  return (
    <li className="flex gap-3 py-2.5">
      <span aria-label={s.label} title={s.label} className={`mt-2 h-2.5 w-2.5 shrink-0 rotate-45 rounded-[1px] ${s.dot}`} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{f.title}</p>
        {f.detail && <p className="mt-0.5 break-words text-sm text-dim">{f.detail}</p>}
        {href && <a href={href} target="_blank" rel="noreferrer noopener" className="mt-0.5 inline-block max-w-full truncate font-mono text-xs text-brass underline">{new URL(href).pathname}</a>}
      </div>
    </li>
  );
}

function Tier({ title, sub, score, label, children, mode }: { title: string; sub: string; score?: number; label?: keyof typeof LABEL; children?: React.ReactNode; mode?: string }) {
  const tone = toneOf(label);
  const border = tone === "scam" ? "border-scam/50" : tone === "unsure" ? "border-unsure/50" : tone === "safe" ? "border-safe/40" : "brass-hairline";
  return (
    <section className={`stitch flex min-w-0 flex-col gap-3 rounded-card border bg-surface p-4 [&>*]:relative [&>*]:z-10 ${border}`}>
      <header className="flex items-start justify-between gap-2">
        <div><h3 className="font-grotesk uppercase text-brass">{title}</h3><p className="text-xs text-dim">{sub}</p></div>
        {mode && <span className="shrink-0 whitespace-nowrap"><ModeBadge mode={mode as never} /></span>}
      </header>
      {score != null && label ? (
        <div className="flex flex-col gap-2">
          <p className={`serif text-2xl font-bold ${tone === "scam" ? "text-scam" : tone === "unsure" ? "text-unsure" : "text-safe"}`}>{LABEL[label]}</p>
          <ScoreDial score={score} scale={0.62} />
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ScanDetail({ m }: { m: MerchantView }) {
  const [detail, setDetail] = useState<SiteDetail | null>(null);
  const [tab, setTab] = useState<"ai" | "rules">("ai");
  const [showTrace, setShowTrace] = useState(false);
  const host = m.host ?? m.key;
  const ready = !!m.basic && m.phase !== "crawling";
  // A new charge (live push or the card watcher) opens the Nemotron trace so it streams in view.
  useEffect(() => { if (m.isNew) setShowTrace(true); }, [m.key, m.isNew]);
  useEffect(() => {
    setDetail(null);
    if (!ready) return;
    api<SiteDetail>(`/api/scan/site?host=${encodeURIComponent(host)}`).then(setDetail).catch(() => setDetail(null));
  }, [host, ready, m.deep?.verdict?.score]);

  const b = m.basic;
  const deep = m.deep?.verdict ?? null;
  const origin = b?.crawl.origin;
  const steps = m.steps.length ? m.steps : detail?.trace ?? [];
  const latest = m.txns.find((t) => m.newTxnIds?.includes(t.id)) ?? m.txns[0];
  const aiFindings = deep?.analysis?.findings ?? [];
  const ruleFindings = b?.report.findings ?? [];
  const showAi = tab === "ai" && aiFindings.length > 0;
  const i = b?.intel;
  const deepRunning = m.phase === "deep" && !m.deep;
  const siteLink = origin ?? (m.host ? `https://${m.host.replace(/\/$/, "")}` : null);

  return (
    <article className="flex min-w-0 flex-col gap-5" aria-label={`${m.merchant} details`}>
      <header className="card-face relative flex flex-wrap items-start justify-between gap-3 rounded-[16px] p-5 pl-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="serif text-3xl font-bold tracking-tight">{m.merchant}</h2>
            {b?.crawl.ownStore && <span className="rounded-full border border-[#6a5a36]/50 px-2.5 py-0.5 text-xs font-bold text-[#5a4a2a]">Bluff demo storefront</span>}
            {b?.report.stats.selfDescribedDemo && !b.crawl.ownStore && <span className="rounded-full border border-[#6a5a36]/50 px-2.5 py-0.5 text-xs font-bold text-[#5a4a2a]">Public demo shop</span>}
          </div>
          {siteLink && <a href={siteLink} target="_blank" rel="noreferrer noopener" className="font-mono text-sm font-semibold text-[#7a4a05] underline">{host}</a>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {m.txns.map((t) => {
              const isNew = !!m.newTxnIds?.includes(t.id);
              return <span key={t.id} className={`num rounded-full border border-dashed px-2.5 py-0.5 text-xs font-semibold text-[#3a301c] ${isNew ? "border-[#7a4a05] bg-[#d9b46b]/50" : "border-[#6a5a36]/60 bg-[#6a5a36]/10"}`}>{isNew ? "NEW · " : ""}{shortDate(t.ts)} · {money(t.amountCents)}</span>;
            })}
            <span className="rounded-full px-2 py-0.5 font-mono text-xs text-[#5a4a2a]">{m.descriptor}</span>
          </div>
          {m.link && (
            <p className={`mt-2 inline-flex flex-wrap items-center gap-x-2 rounded-control border px-3 py-1.5 text-sm text-[#2a2418] ${m.link.kind === "flagged" ? "border-[#b3281f]/50 bg-[#b3281f]/10" : "border-[#6a5a36]/40 bg-[#6a5a36]/10"}`}>
              <span className="font-semibold">{linkText(m.link)}</span>
              <Link href="/exposure" className="text-xs font-semibold text-[#7a4a05] underline">Exposure log</Link>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/charges/${latest.id}`} className="btn-ink inline-flex min-h-[44px] items-center rounded-full px-5 text-sm font-semibold">
            {(deep ?? b?.verdict)?.verdict === "looks_ok" ? "View charge" : "Dispute this charge"}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <Tier title="Basic check" sub={b ? `Rules only · ${b.crawl.pages.length} pages + registry · no AI` : "Crawling the site…"} score={b?.report.score} label={b?.report.label} mode={b ? "basic" : undefined}>
          {!b && <div className="flex flex-col gap-2">{m.pagesSeen.slice(-4).map((p) => <p key={p.path} className="truncate font-mono text-xs text-dim">↳ {p.type} · {p.path}</p>)}<div className="skeleton h-3 w-2/3" /></div>}
          {b && <p className="text-sm text-dim">{b.report.findings.filter((f) => f.severity === "high").length} high-risk · {b.report.findings.filter((f) => f.severity === "medium").length} medium · {b.report.findings.filter((f) => f.severity === "good").length} good signs · {Math.round(b.report.confidence * 100)}% sure</p>}
        </Tier>
        <Tier title="Deep analysis" sub={m.deep ? (m.deep.mode === "live" || m.deep.mode === "cached" ? "Nemotron read the pages" : "AI unavailable · showing the basic check") : deepRunning ? "Nemotron is reading the site…" : "Runs after the basic check"}
          score={m.deep?.mode === "live" || m.deep?.mode === "cached" ? deep?.score : undefined} label={m.deep?.mode === "live" || m.deep?.mode === "cached" ? deep?.verdict : undefined} mode={m.deep?.mode}>
          {deepRunning && <div className="flex flex-col gap-1.5">{m.steps.slice(-3).map((s) => <p key={s.seq} className="truncate font-mono text-xs text-dim"><span className="text-brass">{s.tool ?? s.kind}</span> → {s.outputSummary}</p>)}<div className="skeleton h-3 w-1/2" /></div>}
          {deep?.analysis?.summary && (m.deep?.mode === "live" || m.deep?.mode === "cached") && <p className="text-[15px] leading-relaxed">{deep.analysis.summary}</p>}
          {m.deep?.error && m.deep.mode !== "live" && <p className="text-sm text-dim">{m.deep.error} The verdict above falls back to the basic check.</p>}
        </Tier>
      </div>

      <section className="stitch rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-sans text-lg font-bold tracking-tight">What we found</h3>
          <div role="tablist" aria-label="Findings source" className="flex rounded-full border brass-hairline bg-black/25 p-0.5 text-sm">
            <button role="tab" aria-selected={tab === "ai"} onClick={() => setTab("ai")} className={`rounded-full px-4 py-1.5 font-semibold ${tab === "ai" ? "seg-on" : "text-dim"}`}>AI ({aiFindings.length})</button>
            <button role="tab" aria-selected={tab === "rules"} onClick={() => setTab("rules")} className={`rounded-full px-4 py-1.5 font-semibold ${tab === "rules" ? "seg-on" : "text-dim"}`}>Rules ({ruleFindings.length})</button>
          </div>
        </div>
        {tab === "ai" && !aiFindings.length && <p className="py-2 text-sm text-dim">{deepRunning ? "Waiting for the deep analysis…" : "No AI findings for this site yet. Switch to Rules."}</p>}
        <ul className="divide-y divide-[rgba(217,180,107,0.16)]">
          {(showAi ? aiFindings : tab === "rules" ? ruleFindings : []).map((f, n) => <Finding key={n} f={f} origin={origin} />)}
        </ul>
      </section>

      {i && b && (
        <section className="grid gap-4 lg:grid-cols-2">
          <div className="stitch rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
            <h3 className="font-sans mb-2 text-lg font-bold tracking-tight">Site facts</h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="whitespace-nowrap text-dim">Domain age</dt><dd>{fmtAge(i.registration.ageDays)}{i.registration.createdAt ? ` (since ${i.registration.createdAt.slice(0, 10)})` : ""}{i.registration.source === "demo_registry" ? " · demo registry" : ""}</dd>
              <dt className="whitespace-nowrap text-dim">Registrar</dt><dd className="break-words">{i.registration.registrar ?? "unknown"}</dd>
              <dt className="whitespace-nowrap text-dim">First archived</dt><dd>{i.wayback.firstSeen ?? (i.wayback.source === "archive.org" ? "never" : "n/a")}</dd>
              <dt className="whitespace-nowrap text-dim">HTTPS</dt><dd>{b.crawl.ownStore ? "local demo hosting" : i.tls.issuer ? `${i.tls.ok ? "valid" : "invalid"} · ${i.tls.issuer}` : b.crawl.https ? "yes" : "no"}</dd>
              <dt className="whitespace-nowrap text-dim">Payments</dt><dd>{b.report.stats.payments.map((p) => p.replace("_", " ")).join(", ") || "none listed"}</dd>
              <dt className="whitespace-nowrap text-dim">Contact</dt><dd className="break-words">{[...b.report.stats.emails, ...b.report.stats.phones].slice(0, 3).join(" · ") || "none found"}</dd>
              {b.report.stats.addresses.length > 0 && <><dt className="whitespace-nowrap text-dim">Address</dt><dd className="break-words">{b.report.stats.addresses[0]}</dd></>}
              {b.report.stats.companies.length > 0 && <><dt className="whitespace-nowrap text-dim">Company</dt><dd className="break-words">{b.report.stats.companies.join(" · ")}</dd></>}
            </dl>
          </div>
          <div className="stitch rounded-card border brass-hairline bg-surface p-4 [&>*]:relative [&>*]:z-10">
            <h3 className="font-sans mb-1 text-lg font-bold tracking-tight">Pages crawled</h3>
            <p className="mb-2 text-xs text-dim">{b.crawl.pages.length} pages in {(b.crawl.ms / 1000).toFixed(1)} s · robots.txt {b.crawl.robots ? "read" : "none"}{b.crawl.sitemapUrls ? ` · sitemap ${b.crawl.sitemapUrls} URLs` : ""}{b.crawl.robotsHidden ? ` · ${b.crawl.robotsHidden} page${b.crawl.robotsHidden === 1 ? "" : "s"} robots.txt hides, read anyway (you asked)` : ""}{b.crawl.rendered ? ` · ${b.crawl.rendered} rendered in a headless browser` : ""}</p>
            <ul className="flex flex-col gap-1 text-sm">
              {b.crawl.pages.map((p) => {
                const href = pageUrl(origin, p.path);
                return (
                  <li key={p.path} className="flex min-w-0 items-center gap-2">
                    <span className="w-16 shrink-0 rounded-full border border-dashed border-accent/40 px-1.5 text-center text-[11px] uppercase tracking-wide text-dim">{p.type}</span>
                    {href ? <a href={href} target="_blank" rel="noreferrer noopener" className="min-w-0 flex-1 truncate font-mono text-xs hover:underline" title={p.title}>{p.path}</a> : <span className="min-w-0 flex-1 truncate font-mono text-xs">{p.path}</span>}
                    <span className="num shrink-0 text-xs text-dim">{p.words}w</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {steps.length > 0 && (
        <section>
          <button type="button" onClick={() => setShowTrace((s) => !s)} aria-expanded={showTrace} className="text-sm font-medium text-brass underline">
            {showTrace ? "Hide" : "Show"} Nemotron agent trace ({steps.length} steps)
          </button>
          {showTrace && <div className="mt-3"><AgentTrace steps={steps} running={deepRunning} label={`Deep analysis · ${host}`} /></div>}
        </section>
      )}
    </article>
  );
}
