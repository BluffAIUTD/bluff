"use client";
import { useCallback, useEffect, useRef, useState } from "react";
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

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="font-grotesk text-3xl font-bold tracking-tight">Check a store or a text</h1>
        <p className="mt-1 text-dim">Pick a demo store, paste a link, or paste a message. Bluff checks it before you hand over your info.</p>
      </header>

      <section aria-labelledby="stores-h" className="flex flex-col gap-3">
        <h2 id="stores-h" className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Demo stores</h2>
        <StorePicker selected={store} onPick={pick} disabled={starting} />
      </section>

      <form onSubmit={(e) => { e.preventDefault(); setStore(null); void startPage(url, null); }} className="flex flex-col gap-2">
        <label htmlFor="url" className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Or paste a link</label>
        <div className="flex gap-2">
          <input id="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example-store.com"
            className="min-h-[44px] flex-1 rounded-control border border-line bg-surface px-3 outline-none focus:border-accent" />
          <Button type="submit" disabled={starting}>Check link</Button>
        </div>
      </form>

      <form onSubmit={(e) => { e.preventDefault(); void startText(); }} className="flex flex-col gap-2">
        <label htmlFor="msg" className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Or paste a text message</label>
        <textarea id="msg" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a suspicious text or email here"
          className="rounded-control border border-line bg-surface p-3 outline-none focus:border-accent" />
        <p className="text-xs text-dim">Pasted messages are sent to Bluff for the check and not kept after the verdict.</p>
        <Button type="submit" variant="secondary" disabled={starting} className="self-start">Check text</Button>
      </form>

      {err && <ErrorState title="Can't check that yet" message={err} />}

      {runId && subject && (
        <section aria-live="polite" className="flex flex-col gap-3">
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
  );
}
