"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { STORES } from "@/data/stores";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { RunView } from "../verdict/RunView";
import { ExposureActions } from "./ExposureActions";
import { StorePicker } from "./StorePicker";

type Subject = { kind: "page"; url: string; host: string; demo: boolean; siteReview: boolean } | { kind: "message" };

export function CheckClient({ initialStore }: { initialStore?: string }) {
  const [store, setStore] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [starting, setStarting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const startPage = useCallback(async (raw: string, slug: string | null) => {
    const value = raw.trim();
    if (!value) { setErr("Paste a link or pick a store"); return; }
    setStarting(true); setErr(null); setRunId(null);
    try {
      const host = slug ?? value.replace(/^[a-z]+:\/\//i, "").split(/[/?#]/)[0].replace(/^www\./, "").toLowerCase();
      const r = await api<{ runId: string; siteReview?: boolean }>("/api/investigate/page", { method: "POST", json: { url: value, host, fieldTypes: ["card_number", "cvv"], source: "check" } });
      setSubject({ kind: "page", url: value.startsWith("http") ? value : `https://${value}`, host, demo: !!slug || STORES.some((s) => s.slug === host.split(".")[0]), siteReview: !!r.siteReview });
      setRunId(r.runId);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't start the check. Try again."); }
    finally { setStarting(false); }
  }, []);

  const startText = useCallback(async () => {
    const value = text.trim();
    if (!value) { setErr("Paste a text message or link to check"); return; }
    setStarting(true); setErr(null); setRunId(null); setStore(null);
    try {
      const r = await api<{ runId: string }>("/api/investigate/message", { method: "POST", json: { text: value, source: "check" } });
      setSubject({ kind: "message" });
      setRunId(r.runId);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't start the check. Try again."); }
    finally { setStarting(false); }
  }, [text]);

  function pick(slug: string) { setStore(slug); setUrl(slug); setText(""); void startPage(slug, slug); }

  useEffect(() => {
    if (initialStore && !started.current && STORES.some((s) => s.slug === initialStore)) { started.current = true; pick(initialStore); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStore]);

  const field = "min-h-[48px] w-full rounded-control border border-ink bg-white px-3 font-mono text-[14px] outline-none placeholder:text-gray-5 focus:border-accent focus:ring-2 focus:ring-accent/30";
  return (
    <div className="grid gap-x-12 gap-y-10 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-10">
        <header className="flex flex-col gap-3">
          <p className="eyebrow">Checkout Guard</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Check a store or a text</h1>
          <p className="max-w-xl text-lg leading-relaxed text-dim">Pick a demo store, paste a link, or paste a message. Bluff checks it before you hand over your info.</p>
        </header>

        <section aria-labelledby="stores-h" className="flex flex-col gap-3">
          <h2 id="stores-h" className="eyebrow">Demo stores <span className="normal-case tracking-normal text-gray-5">· demo sites, not real</span></h2>
          <StorePicker selected={store} onPick={pick} disabled={starting} />
        </section>

        <form onSubmit={(e) => { e.preventDefault(); setStore(null); void startPage(url, null); }} className="flex flex-col gap-2">
          <label htmlFor="url" className="eyebrow">Or paste a link</label>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <input id="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example-store.com" className={field} />
            <Button type="submit" disabled={starting} className="shrink-0 whitespace-nowrap">Check link</Button>
          </div>
        </form>

        <form onSubmit={(e) => { e.preventDefault(); void startText(); }} className="flex flex-col gap-2">
          <label htmlFor="msg" className="eyebrow">Or paste a text message</label>
          <textarea id="msg" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a suspicious text or email here" className={`${field} py-3 font-sans text-[15px]`} />
          <p className="text-xs text-dim">Pasted messages are sent to Bluff for the check and not kept after the verdict.</p>
          <Button type="submit" variant="secondary" disabled={starting} className="self-start">Check text</Button>
        </form>

        {err && <ErrorState title="Can't check that yet" message={err} />}

        {runId && subject && (
          <section aria-live="polite" className="flex flex-col gap-4">
            <div className="rule-top pt-3"><h2 className="eyebrow">Findings</h2></div>
            {subject.kind === "page" && subject.siteReview && <p className="text-sm text-dim">Bluff is reading this site&apos;s public pages and sending them to Nemotron for review.</p>}
            {subject.kind === "page" && !subject.siteReview && !subject.demo && <p className="text-sm text-dim">Limited check: page not analyzed. Only the domain and link were looked at.</p>}
            <RunView
              runId={runId}
              subtitle={subject.kind === "page" ? subject.host : "Message check"}
              onRetry={() => (subject.kind === "page" ? void startPage(subject.url, store) : void startText())}
              actions={(_, meta) => subject.kind === "page" && meta.verdictId
                ? <ExposureActions verdictId={meta.verdictId} url={subject.url} host={subject.host} onLeave={() => { setRunId(null); setSubject(null); setStore(null); }} />
                : null}
            />
          </section>
        )}
      </div>

      <aside aria-label="Marginalia" className="flex flex-col gap-8 lg:border-l lg:border-line lg:pl-8">
        <section className="flex flex-col gap-3">
          <div className="rule-top pt-3"><h2 className="eyebrow">What leaves your device</h2></div>
          <p className="text-sm text-dim">Only the domain, the kinds of fields a page asks for, and yes/no signals. Never what you typed, never the page text from your browser.</p>
          <Link href="/privacy" className="text-sm underline underline-offset-4 hover:text-scam">Read the data flow</Link>
        </section>
        <section className="flex flex-col gap-3">
          <div className="rule-top pt-3"><h2 className="eyebrow">Reading a verdict</h2></div>
          <p className="text-sm text-dim">Every score comes with a confidence and the reason for it. Below 50% sure, Bluff says Unsure instead of guessing red or green.</p>
        </section>
      </aside>
    </div>
  );
}
