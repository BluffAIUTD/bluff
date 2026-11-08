"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { GameCard, type CardData, type Reveal } from "./GameCard";

type Today = { day: string; n: number; isToday: boolean; cards: CardData[]; streak: number; alreadyPlayed: { score: number } | null };
type Result = { score: number; streak: number; weakest: string | null; shareText: string; practice: boolean; results: boolean[] };

export function GameClient({ day }: { day?: string }) {
  const toast = useToast();
  const [data, setData] = useState<Today | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<{ cardId: string; guess: "legit" | "scam" }[]>([]);
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const load = useCallback(async () => {
    setLoadErr(null);
    try { setData(await api<Today>(`/api/game/today${day ? `?d=${encodeURIComponent(day)}` : ""}`)); }
    catch (e) { setLoadErr(e instanceof ApiFailure ? e.message : "Couldn't load today's cards."); }
  }, [day]);
  useEffect(() => { void load(); }, [load]);

  async function guess(g: "legit" | "scam") {
    if (!data || busy || reveal) return;
    setBusy(true); setErr(null);
    try {
      const card = data.cards[i];
      const r = await api<Omit<Reveal, "guess">>("/api/game/answer", { method: "POST", json: { cardId: card.id, guess: g } });
      setReveal({ ...r, guess: g });
      setAnswers((a) => [...a, { cardId: card.id, guess: g }]);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't check that answer. Try again."); }
    finally { setBusy(false); }
  }

  async function finish(finalAnswers = answers) {
    if (!data) return;
    setBusy(true); setErr(null);
    try { setResult(await api<Result>("/api/game/finish", { method: "POST", json: { day: data.day, answers: finalAnswers } })); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't save your score. Try again."); }
    finally { setBusy(false); }
  }

  function next() {
    if (!data) return;
    if (i + 1 >= data.cards.length) { void finish(); return; }
    setI(i + 1); setReveal(null);
  }

  async function share() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.shareText); toast("Copied. Paste it anywhere."); }
    catch { toast("Couldn't copy. Select the text to share."); }
  }

  function again() { setI(0); setAnswers([]); setReveal(null); setResult(null); void load(); }

  if (loadErr) return <ErrorState title="Can't load Call the Bluff" message={loadErr} action={<button type="button" onClick={load} className="self-start text-sm font-medium text-accent underline underline-offset-4">Try again</button>} />;
  if (!data) return <div aria-busy className="flex flex-col gap-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-52 w-full" /></div>;

  if (result) {
    return (
      <section aria-label="Result" className="dossier flex max-w-2xl flex-col gap-6 border-t-[5px] border-t-ink p-6 sm:p-8">
        <p className="eyebrow">Call the Bluff #{data.n}{result.practice && " · practice (today's score already counted)"}</p>
        <p className="numeral text-[112px] font-semibold" aria-label={`Score ${result.score} out of 5`}>{result.score}<span className="text-4xl text-dim">/5</span></p>
        <p className="text-2xl tracking-wide" aria-hidden>{result.results.map((r) => (r ? "🟩" : "🟥")).join("")}</p>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="eyebrow">Streak</dt><dd className="numeral mt-1 text-4xl font-semibold">{result.streak} day{result.streak === 1 ? "" : "s"}</dd></div>
          <div><dt className="eyebrow">Weakest spot</dt><dd className="mt-1 font-display text-2xl">{result.weakest ? result.weakest.replace(/_/g, " ") : "None. Clean sweep."}</dd></div>
        </dl>
        <div className="flex flex-wrap gap-3">
          <Button onClick={share}>Share</Button>
          <Button variant="secondary" onClick={again}>Play again (practice)</Button>
        </div>
        <p className="border border-dashed border-gray-3 bg-bg p-3 font-mono text-sm" aria-label="Share preview">{result.shareText}</p>
        {err && <ErrorState message={err} />}
      </section>
    );
  }

  const card = data.cards[i];
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-ink pb-5">
        <div>
          <p className="eyebrow">Daily game</p>
          <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Call the Bluff <span className="text-gray-4">#{data.n}</span></h1>
          <p className="mt-1 text-dim">Is it legit, or a bluff? Five cards, about a minute.</p>
        </div>
        <p className="eyebrow">Streak <span className="numeral ml-1 align-middle text-3xl text-fg">{data.streak}</span></p>
      </header>
      {data.alreadyPlayed && <p role="status" className="border-l-4 border-ink bg-surface2 px-4 py-2 text-sm">You scored {data.alreadyPlayed.score}/5 today. Replays are practice and won&apos;t change your streak.</p>}
      <p className="font-mono text-sm text-dim" aria-live="polite">Card {i + 1} of {data.cards.length}</p>
      <GameCard card={card} reveal={reveal ?? undefined} />
      {err && <ErrorState message={err} />}
      {!reveal ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="min-h-[56px] text-base" disabled={busy} onClick={() => guess("legit")}>Legit</Button>
          <Button variant="danger" className="min-h-[56px] text-base" disabled={busy} onClick={() => guess("scam")}>Bluff!</Button>
        </div>
      ) : (
        <Button className="min-h-[56px] text-base" onClick={next} disabled={busy}>{i + 1 >= data.cards.length ? (busy ? "Scoring…" : "See my score") : "Next card"}</Button>
      )}
    </div>
  );
}
