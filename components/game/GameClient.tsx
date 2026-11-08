"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ChipButton } from "../table/ChipButton";
import { ChipDisc } from "../table/chips";
import { ErrorState } from "../ui/ErrorState";
import { Skeleton } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { BonusCard, type Bonus } from "./BonusCard";
import { Countdown } from "./Countdown";
import { DifficultyPill, GameCard, type CardData, type Reveal } from "./GameCard";
import { Stats, type GameStats } from "./Stats";
import type { Tap } from "./text";

type Finish = { day: string; score: number; giveaways: number; streak: number; weakest: string | null; shareText: string; practice: boolean; results: boolean[] };
type ArchiveDay = { day: string; n: number; score: number | null };
export type GameState = {
  day: string; n: number; isToday: boolean; practice: boolean; cards: CardData[]; progress: Reveal[]; done: Finish | null;
  stats: GameStats; streak: number; nextAt: string; serverNow: string; bonus: Bonus | null; archive: ArchiveDay[];
};

const KIND: Record<string, string> = { text: "Text", checkout: "Checkout", email: "Email", receipt: "Receipt", bank_alert: "Bank alert" };
const prettyDay = (d: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${d}T12:00:00Z`));
/** The result row as chips: green for a right call, red for a miss (the shareable emoji grid comes from the server). */
const ResultChips = ({ results }: { results: boolean[] }) => (
  <p className="flex gap-2" aria-hidden>{results.map((r, k) => <span key={k} className="chip-place" style={{ animationDelay: `${k * 90}ms` }}><ChipDisc tone={r ? "safe" : "scam"} size={38} /></span>)}</p>
);

export function GameClient({ day }: { day?: string }) {
  const toast = useToast();
  const [data, setData] = useState<GameState | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [reveals, setReveals] = useState<Record<string, Reveal>>({});
  const [i, setI] = useState(0);
  const [tapping, setTapping] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const promptRef = useRef<HTMLParagraphElement>(null);
  // The Bluff! button disappears when the tap step starts: move focus to the prompt (Tab then reaches the words).
  useEffect(() => { if (tapping) promptRef.current?.focus(); }, [tapping]);

  /** Take a server state: restore locked answers and resume at the first unanswered card. */
  const adopt = useCallback((s: GameState) => {
    const r = Object.fromEntries(s.progress.map((p) => [p.cardId, p]));
    const next = s.cards.findIndex((c) => !r[c.id]);
    setData(s); setReveals(r); setI(next < 0 ? s.cards.length - 1 : next); setTapping(false); setErr(null);
  }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    try { adopt(await api<GameState>(`/api/game/today${day ? `?d=${encodeURIComponent(day)}` : ""}`)); }
    catch (e) { setLoadErr(e instanceof ApiFailure ? e.message : "Couldn't load today's cards."); }
  }, [day, adopt]);
  useEffect(() => { void load(); }, [load]);

  async function submit(guess: "legit" | "scam", tap: Tap | null) {
    if (!data || busy) return;
    const card = data.cards[i];
    setBusy(true); setErr(null);
    try {
      const r = await api<Reveal>("/api/game/answer", { method: "POST", json: { cardId: card.id, guess, tap, day: data.day } });
      setReveals((m) => ({ ...m, [card.id]: r }));
      setTapping(false);
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't check that answer. Try again."); }
    finally { setBusy(false); }
  }

  async function finish() {
    if (!data) return;
    setBusy(true); setErr(null);
    try {
      // Always send what we have: a live day is scored from the server's locked answers (the body is ignored), but a game
      // loaded before midnight and answered after it became practice on the server and is scored from these.
      const answers = data.cards.flatMap((c) => (reveals[c.id] ? [{ cardId: c.id, guess: reveals[c.id].guess, tap: reveals[c.id].tap ?? null }] : []));
      adopt(await api<GameState>("/api/game/finish", { method: "POST", json: { day: data.day, answers } }));
    } catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't save your score. Try again."); }
    finally { setBusy(false); }
  }

  function next() {
    if (!data) return;
    if (i + 1 >= data.cards.length) { void finish(); return; }
    setI(i + 1); setTapping(false);
  }

  if (loadErr) return <ErrorState title="Can't load Call the Bluff" message={loadErr} action={<button type="button" onClick={load} className="self-start text-sm font-medium text-brass underline">Try again</button>} />;
  if (!data) return <div aria-busy className="flex flex-col gap-3"><Skeleton className="h-8 w-64" /><Skeleton className="h-52 w-full" /></div>;
  if (data.done) return <Finished data={data} done={data.done} toast={toast} />;

  const card = data.cards[i];
  const reveal = reveals[card.id];
  const last = i + 1 >= data.cards.length;
  return (
    <div className="flex flex-col gap-5">
      <Header data={data} />
      <HowToPlay />
      {data.practice && <PracticeNote data={data} />}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ol aria-hidden className="flex gap-1.5">
            {data.cards.map((c, k) => {
              const r = reveals[c.id];
              return <li key={c.id} className={k === i && !r ? "-translate-y-0.5" : r || k === i ? "" : "opacity-50"}><ChipDisc tone={r ? (r.correct ? "safe" : "scam") : k === i ? "brass" : "black"} size={22} /></li>;
            })}
          </ol>
          <p className="text-sm text-dim" aria-live="polite">Card {i + 1} of {data.cards.length}</p>
        </div>
        <DifficultyPill level={card.difficulty ?? "medium"} />
      </div>
      {tapping && !reveal && (
        <p ref={promptRef} tabIndex={-1} aria-live="assertive" className="mx-auto w-full max-w-[600px] rounded-control border border-accent/60 bg-accent/10 px-4 py-2.5 text-sm font-semibold outline-none">
          What gave it away? Tap the word or phrase
        </p>
      )}
      <GameCard rank={i + 1} card={card} reveal={reveal} onTap={tapping && !reveal ? (t) => void submit("scam", t) : undefined} busy={busy} />
      {err && <ErrorState message={err} />}
      {reveal ? (
        <Button className="mx-auto min-h-[56px] w-full max-w-[600px] text-base" onClick={next} disabled={busy}>{last ? (busy ? "Scoring…" : "See my score") : "Next card"}</Button>
      ) : tapping ? (
        <div className="mx-auto grid w-full max-w-[600px] grid-cols-[auto_1fr] gap-3">
          <Button variant="ghost" className="min-h-[56px]" disabled={busy} onClick={() => setTapping(false)}>Back</Button>
          <Button className="min-h-[56px] text-base" disabled={busy} onClick={() => void submit("scam", null)}>Just lock it in</Button>
        </div>
      ) : (
        <div className="mx-auto grid w-full max-w-[600px] grid-cols-2 gap-3">
          <ChipButton tone="ivory" className="justify-center !pr-4" disabled={busy} onClick={() => void submit("legit", null)}>Legit</ChipButton>
          <ChipButton tone="scam" className="justify-center !pr-4" disabled={busy} onClick={() => setTapping(true)}>Bluff!</ChipButton>
        </div>
      )}
      <Archive data={data} />
    </div>
  );
}

function Header({ data }: { data: GameState }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-brass">Daily game</p>
        <h1 className="text-4xl font-semibold tracking-tight">Call the Bluff <span className="text-dim">#{data.n}</span></h1>
        <p className="text-dim">{data.isToday ? "Today's five messages, the same for everyone. Legit, or a bluff?" : `The puzzle from ${prettyDay(data.day)}.`}</p>
      </div>
      <p className="text-sm text-dim">Streak <span className="num font-bold text-fg">🔥 {data.streak}</span></p>
    </header>
  );
}

function HowToPlay() {
  return (
    <details className="mx-auto w-full max-w-[600px] rounded-control border brass-hairline bg-black/25 px-4 py-2.5 text-sm">
      <summary className="cursor-pointer font-semibold">How to play: call it, then tap the giveaway</summary>
      <ol className="mt-2 flex list-decimal flex-col gap-1 pl-5 text-dim">
        <li>Read each message and call it <span className="font-medium text-fg">Legit</span> or <span className="font-medium text-fg">Bluff!</span></li>
        <li>After Bluff!, tap the word that gave it away (or just lock it in). Tapping a real red flag counts as a giveaway spotted.</li>
        <li>Your first call on each card is final. Score = right calls out of 5; a new puzzle every midnight, Central time.</li>
      </ol>
    </details>
  );
}

function PracticeNote({ data }: { data: GameState }) {
  return (
    <p role="status" className="rounded-control border border-unsure/50 bg-unsure/10 px-4 py-2.5 text-sm">
      Practice: puzzle #{data.n} from {prettyDay(data.day)}. It doesn&apos;t change your streak or stats.{" "}
      <Link href="/play" className="font-semibold text-brass underline">Back to today&apos;s puzzle</Link>
    </p>
  );
}

function Archive({ data }: { data: GameState }) {
  const days = data.archive.filter((a) => a.day !== data.day);
  if (!days.length && data.isToday) return null;
  return (
    <nav aria-label="Past puzzles" className="flex flex-col gap-3 border-t border-dashed brass-hairline pt-4">
      <h2 className="font-grotesk uppercase text-dim">Past puzzles (practice)</h2>
      <ul className="flex flex-wrap gap-2">
        {!data.isToday && <li><Link href="/play" className="btn-brass inline-flex min-h-[44px] items-center rounded-full px-4 text-sm">Today&apos;s puzzle</Link></li>}
        {days.map((a) => (
          <li key={a.day}>
            <Link href={`/play?d=${a.day}`} className="btn-rail inline-flex min-h-[44px] items-center gap-1 rounded-full px-4 text-sm font-semibold">
              {a.day === data.archive[0]?.day ? "Yesterday's puzzle" : `#${a.n} · ${prettyDay(a.day)}`}
              {a.score !== null && <span className="num text-dim">· {a.score}/5</span>}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Finished({ data, done, toast }: { data: GameState; done: Finish; toast: (t: string) => void }) {
  async function share() {
    const text = done.shareText;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ text }); return; }
      catch (e) { if ((e as Error).name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); toast("Copied. Paste it anywhere."); }
    catch { toast("Couldn't copy. Select the text to share."); }
  }
  const byId = Object.fromEntries(data.progress.map((p) => [p.cardId, p]));
  return (
    <div className="flex flex-col gap-5">
      <Header data={data} />
      {done.practice && <PracticeNote data={data} />}
      <section aria-label="Result" className="stitch flex flex-col gap-4 rounded-card border brass-hairline bg-surface p-5 sm:p-8 [&>*]:relative [&>*]:z-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <p className="num text-7xl font-bold brass-text" aria-label={`Score ${done.score} out of 5`}>{done.score}<span className="text-2xl text-dim">/5</span></p>
          <ResultChips results={done.results} />
        </div>
        <p className="text-sm">{done.giveaways > 0 ? `🔍 ${done.giveaways} giveaway${done.giveaways === 1 ? "" : "s"} spotted` : "No giveaways tapped this time. After Bluff!, tap the word that gave it away."}</p>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div><dt className="text-dim">Streak</dt><dd className="num text-2xl font-bold">{done.practice ? "Not counted" : `${done.streak} day${done.streak === 1 ? "" : "s"}`}</dd></div>
          <div><dt className="text-dim">Weakest spot</dt><dd className="text-lg font-medium">{done.weakest ? done.weakest.replace(/_/g, " ") : "None. Clean sweep."}</dd></div>
        </dl>
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-line rounded-control border border-dashed brass-hairline bg-black/25 p-3 font-mono text-sm" aria-label="Share preview">{done.shareText}</p>
          <Button onClick={share} className="self-start">Share</Button>
        </div>
        <Countdown nextAt={data.nextAt} serverNow={data.serverNow} />
      </section>
      <Stats stats={data.stats} highlight={done.practice ? null : done.score} />
      {data.bonus && <BonusCard bonus={data.bonus} />}
      <section aria-label="Review the cards" className="flex flex-col gap-2">
        <h2 className="font-grotesk uppercase text-dim">Review the cards</h2>
        <ol className="flex flex-col gap-2">
          {data.cards.map((c, k) => {
            const r = byId[c.id];
            return (
              <li key={c.id}>
                <details className="rounded-card border brass-hairline bg-surface p-3">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span aria-hidden><ChipDisc tone={r?.correct ? "safe" : "scam"} size={20} /></span>
                    <span className="font-semibold">{k + 1}. {KIND[c.kind] ?? c.kind}</span>
                    <DifficultyPill level={c.difficulty ?? "medium"} />
                    <span className="text-dim">{r ? `${r.isScam ? "Bluff" : "Legit"}, you ${r.correct ? "got it" : "missed it"}${r.giveaway ? " · giveaway spotted" : ""}` : "Not answered"}</span>
                  </summary>
                  {r && <div className="mt-3"><GameCard card={c} reveal={r} rank={k + 1} /></div>}
                </details>
              </li>
            );
          })}
        </ol>
      </section>
      <Archive data={data} />
    </div>
  );
}
