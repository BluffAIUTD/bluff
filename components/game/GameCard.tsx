"use client";
import { FlipCard } from "../table/FlipCard";
import { CornerIndex } from "../table/PlayingCardFace";
import { revealSegments, tapRange, wordTokens, type RevealSegment, type Tap } from "./text";

export type Difficulty = "easy" | "medium" | "hard";
export type CardData = { id: string; kind: string; content: { from?: string; subject?: string; body: string }; difficulty?: Difficulty };
export type Reveal = {
  cardId: string; guess: "legit" | "scam"; correct: boolean; isScam: boolean; redFlags: { span: string; why: string }[]; category: string;
  whyLegit?: string | null; source?: string; origin?: string | null; tap?: Tap | null; giveaway?: boolean;
};

/** Where a card came from. Shown only after the guess: on the front it would hint at the answer. */
const SOURCE: Record<string, { label: string; tone: "good" | "plain" }> = {
  dataset: { label: "Bluff message set (synthetic)", tone: "plain" },
  seed: { label: "Bluff starter card", tone: "plain" },
  tmobile: { label: "Imported message set", tone: "plain" },
  bank: { label: "From your Capital One scan", tone: "good" },
  generated: { label: "Nemotron-generated", tone: "plain" },
  lookalike: { label: "Nemotron lookalike of this week's top scam", tone: "plain" },
};

const KIND: Record<string, string> = { text: "Text message", checkout: "Checkout page", email: "Email", receipt: "Receipt", bank_alert: "Bank alert" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

/** On the felt (below the card and in the review list). */
export function DifficultyPill({ level }: { level: Difficulty }) {
  const n = level === "easy" ? 1 : level === "medium" ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border brass-hairline bg-black/25 px-2.5 py-[2px] text-xs font-semibold text-dim">
      <span aria-hidden className="flex gap-[2px]">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-1.5 rotate-45 rounded-[1px] ${i <= n ? "bg-brass" : "bg-gray-5"}`} />)}</span>
      {DIFF_LABEL[level]}
    </span>
  );
}

/** A small label on ivory card stock. */
function Chipped({ tone, children }: { tone: "good" | "bad" | "plain"; children: React.ReactNode }) {
  const cls = tone === "good" ? "border-[#17734c]/60 bg-[#17734c]/10 text-[#0f5a3a]" : tone === "bad" ? "border-[#b3281f]/60 bg-[#b3281f]/10 text-[#8e1d16]" : "border-[#6a5a36]/40 bg-[#6a5a36]/10 text-[#5a4a2a]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-[2px] text-xs font-bold ${cls}`}>{children}</span>;
}

function Header({ card }: { card: CardData }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-[#5a4a2a]">
        <span className="shrink-0 font-bold uppercase tracking-[0.14em]">{KIND[card.kind] ?? card.kind}</span>
        {card.content.from && <span className="min-w-0 truncate">{card.content.from}</span>}
      </div>
      {card.content.subject && <p className="serif text-xl font-bold [overflow-wrap:anywhere]">{card.content.subject}</p>}
    </>
  );
}

const BODY = "whitespace-pre-line text-[17px] leading-relaxed [overflow-wrap:anywhere]";

/** The front: plain text, or (after "Bluff!") every word is a button that answers "what gave it away?". */
function Front({ card, onTap, busy }: { card: CardData; onTap?: (t: Tap) => void; busy?: boolean }) {
  if (!onTap) return <p className={BODY}>{card.content.body}</p>;
  return (
    <p className={BODY}>
      {wordTokens(card.content.body).map((t) => t.word
        ? <button key={t.start} type="button" data-tap-word disabled={busy} onClick={() => onTap(tapRange(t))}
            className="inline rounded-sm text-left underline decoration-[#6a5a36] decoration-dotted underline-offset-4 transition duration-ui hover:bg-[#d9b46b]/45 hover:decoration-[#7a4a05] focus-visible:bg-[#d9b46b]/45 disabled:cursor-wait">{t.text}</button>
        : <span key={t.start}>{t.text}</span>)}
    </p>
  );
}

const Part = ({ s }: { s: RevealSegment }) => (s.tapped ? <span className="rounded-sm outline outline-2 outline-offset-1 outline-[#7a4a05]">{s.text}</span> : <>{s.text}</>);

function RevealBody({ card, reveal }: { card: CardData; reveal: Reveal }) {
  // One <mark> per red flag, with the tapped word (if any) outlined inside it.
  const groups: { why?: string; parts: RevealSegment[] }[] = [];
  for (const s of revealSegments(card.content.body, reveal.redFlags, reveal.tap ?? null)) {
    const g = groups[groups.length - 1];
    if (g && s.why && g.why === s.why) g.parts.push(s);
    else groups.push({ why: s.why, parts: [s] });
  }
  return (
    <p className={BODY}>
      {groups.map((g, i) => g.why
        ? <mark key={i} title={g.why} className="rounded bg-[#b3281f]/20 px-0.5 text-[inherit] underline decoration-[#b3281f] decoration-2 underline-offset-2">{g.parts.map((s, k) => <Part key={k} s={s} />)}</mark>
        : <span key={i}>{g.parts.map((s, k) => <Part key={k} s={s} />)}</span>)}
    </p>
  );
}

function TapNote({ card, reveal }: { card: CardData; reveal: Reveal }) {
  if (reveal.guess !== "scam" || !reveal.tap) return null;
  const word = card.content.body.slice(reveal.tap.start, reveal.tap.end);
  if (reveal.giveaway) return <p className="rounded-control border border-[#7a4a05]/50 bg-[#d9b46b]/25 px-3 py-2 text-sm font-semibold">🔍 Giveaway spotted: you tapped &ldquo;{word}&rdquo;, one of the red flags.</p>;
  return <p className="rounded-control bg-[#6a5a36]/10 px-3 py-2 text-sm text-[#4d4128]">You tapped &ldquo;{word}&rdquo;{reveal.isScam ? ", which isn't one of the flagged giveaways." : ", but this one was legit."}</p>;
}

/**
 * A literal card: flips (400 ms) after you answer; red-flag spans light up with a one-line why each, the word you tapped
 * is outlined, legit cards say why they're fine, and the card's source shows only now.
 */
export function GameCard({ card, reveal, onTap, busy, rank }: { card: CardData; reveal?: Reveal; onTap?: (t: Tap) => void; busy?: boolean; rank?: number }) {
  const src = reveal?.source ? SOURCE[reveal.source] : undefined;
  const inner = <span aria-hidden className="pointer-events-none absolute inset-[8px] rounded-[11px] border" style={{ borderColor: "rgba(120,90,30,0.28)" }} />;
  return (
    <FlipCard
      flipped={!!reveal}
      className="mx-auto w-full max-w-[600px]"
      front={
        <div aria-hidden={!!reveal} className={`card-face relative flex min-h-[300px] min-w-0 flex-col justify-center gap-2 rounded-[16px] px-6 py-10 pl-16 sm:px-12 sm:pl-20 ${onTap ? "!border-[#7a4a05] ring-2 ring-[#d9b46b]/70" : ""}`}>
          {inner}
          <CornerIndex rank={rank ?? ""} suit="unsure" />
          <CornerIndex rank={rank ?? ""} suit="unsure" flip />
          <div className="relative z-10 flex min-w-0 flex-col gap-2">
            <Header card={card} />
            <Front card={card} onTap={reveal ? undefined : onTap} busy={busy} />
          </div>
        </div>
      }
      back={
        <div aria-hidden={!reveal} className="card-face relative flex min-h-[300px] min-w-0 flex-col gap-4 rounded-[16px] px-6 py-10 pl-16 sm:px-12 sm:pl-20">
          {inner}
          {reveal && (
            <>
              <CornerIndex rank={rank ?? ""} suit={reveal.isScam ? "scam" : "safe"} />
              <CornerIndex rank={rank ?? ""} suit={reveal.isScam ? "scam" : "safe"} flip />
              <div className="relative z-10 flex flex-wrap items-center gap-2">
                <Chipped tone={reveal.correct ? "good" : "bad"}>{reveal.correct ? "Correct" : "Not quite"}</Chipped>
                <Chipped tone={reveal.isScam ? "bad" : "good"}>{reveal.isScam ? "It was a bluff" : "It was legit"}</Chipped>
                <span className="text-xs text-[#5a4a2a]">{reveal.category.replace(/_/g, " ")}</span>
              </div>
              <div className="relative z-10 flex min-w-0 flex-col gap-2">
                <Header card={card} />
                <RevealBody card={card} reveal={reveal} />
              </div>
              <div className="relative z-10 flex flex-col gap-3">
                <TapNote card={card} reveal={reveal} />
                {reveal.redFlags.length > 0
                  ? <ul className="flex flex-col gap-1.5 text-sm">{reveal.redFlags.map((f) => <li key={f.span}><span className="font-bold text-[#8e1d16]">&ldquo;{f.span}&rdquo;</span>: {f.why}</li>)}</ul>
                  : <p className="text-sm text-[#4d4128]">{reveal.whyLegit ? `Why it's legit: ${reveal.whyLegit}` : "No red flags: nothing here asks for secrets, money or a rushed click."}</p>}
                {src && <span className="self-start" title={reveal.origin ?? undefined}><Chipped tone={src.tone}>{src.label}</Chipped></span>}
              </div>
            </>
          )}
        </div>
      }
    />
  );
}
