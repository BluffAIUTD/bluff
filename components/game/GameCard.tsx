"use client";
import { Badge } from "../ui/Badge";
import { revealSegments, tapRange, wordTokens, type RevealSegment, type Tap } from "./text";

export type Difficulty = "easy" | "medium" | "hard";
export type CardData = { id: string; kind: string; content: { from?: string; subject?: string; body: string }; difficulty?: Difficulty };
export type Reveal = {
  cardId: string; guess: "legit" | "scam"; correct: boolean; isScam: boolean; redFlags: { span: string; why: string }[]; category: string;
  whyLegit?: string | null; source?: string; origin?: string | null; tap?: Tap | null; giveaway?: boolean;
};

/** Where a card came from. Shown only after the guess: on the front it would hint at the answer. */
const SOURCE: Record<string, { label: string; tone: "accent" | "safe" | "neutral" }> = {
  dataset: { label: "Bluff message set (synthetic)", tone: "accent" },
  seed: { label: "Bluff starter card", tone: "neutral" },
  tmobile: { label: "Imported message set", tone: "accent" },
  bank: { label: "From your Capital One scan", tone: "safe" },
  generated: { label: "Nemotron-generated", tone: "neutral" },
  lookalike: { label: "Nemotron lookalike of this week's top scam", tone: "neutral" },
};

const KIND: Record<string, string> = { text: "Text message", checkout: "Checkout page", email: "Email", receipt: "Receipt", bank_alert: "Bank alert" };
const DIFF_LABEL: Record<Difficulty, string> = { easy: "Easy", medium: "Medium", hard: "Hard" };

export function DifficultyPill({ level }: { level: Difficulty }) {
  const n = level === "easy" ? 1 : level === "medium" ? 2 : 3;
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-surface2 px-2 py-[2px] text-xs font-medium text-dim">
      <span aria-hidden className="flex gap-[2px]">{[1, 2, 3].map((i) => <span key={i} className={`h-1.5 w-1.5 rounded-full ${i <= n ? "bg-fg" : "bg-gray-5"}`} />)}</span>
      {DIFF_LABEL[level]}
    </span>
  );
}

function Header({ card }: { card: CardData }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2 text-xs text-dim">
        <span className="shrink-0 font-medium uppercase tracking-wide">{KIND[card.kind] ?? card.kind}</span>
        {card.content.from && <span className="min-w-0 truncate">{card.content.from}</span>}
      </div>
      {card.content.subject && <p className="font-grotesk text-lg font-bold [overflow-wrap:anywhere]">{card.content.subject}</p>}
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
            className="inline rounded-sm text-left underline decoration-gray-4 decoration-dotted underline-offset-4 transition duration-ui hover:bg-accent/25 hover:decoration-accent focus-visible:bg-accent/25 focus-visible:outline-none disabled:cursor-wait">{t.text}</button>
        : <span key={t.start}>{t.text}</span>)}
    </p>
  );
}

const Part = ({ s }: { s: RevealSegment }) => (s.tapped ? <span className="rounded-sm outline outline-2 outline-offset-1 outline-accent">{s.text}</span> : <>{s.text}</>);

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
        ? <mark key={i} title={g.why} className="rounded bg-scam/30 px-0.5 text-fg underline decoration-scam decoration-2 underline-offset-2">{g.parts.map((s, k) => <Part key={k} s={s} />)}</mark>
        : <span key={i}>{g.parts.map((s, k) => <Part key={k} s={s} />)}</span>)}
    </p>
  );
}

function TapNote({ card, reveal }: { card: CardData; reveal: Reveal }) {
  if (reveal.guess !== "scam" || !reveal.tap) return null;
  const word = card.content.body.slice(reveal.tap.start, reveal.tap.end);
  if (reveal.giveaway) return <p className="rounded-control border border-accent/50 bg-accent/10 px-3 py-2 text-sm">🔍 Giveaway spotted: you tapped &ldquo;{word}&rdquo;, one of the red flags.</p>;
  return <p className="rounded-control bg-surface2 px-3 py-2 text-sm text-dim">You tapped &ldquo;{word}&rdquo;{reveal.isScam ? ", which isn't one of the flagged giveaways." : ", but this one was legit."}</p>;
}

/**
 * A literal card: flips (400 ms) after you answer; red-flag spans light up with a one-line why each, the word you tapped
 * is outlined, legit cards say why they're fine, and the card's source shows only now.
 */
export function GameCard({ card, reveal, onTap, busy }: { card: CardData; reveal?: Reveal; onTap?: (t: Tap) => void; busy?: boolean }) {
  const src = reveal?.source ? SOURCE[reveal.source] : undefined;
  return (
    <div className="[perspective:1200px]">
      <div className={`grid transition-transform duration-[400ms] [transform-style:preserve-3d] ${reveal ? "[transform:rotateY(180deg)]" : ""}`}>
        <div aria-hidden={!!reveal} className={`col-start-1 row-start-1 flex min-w-0 flex-col gap-2 rounded-card border bg-surface p-5 shadow-lg [backface-visibility:hidden] ${onTap ? "border-accent/60" : "border-line"}`}>
          <Header card={card} />
          <Front card={card} onTap={reveal ? undefined : onTap} busy={busy} />
        </div>
        <div aria-hidden={!reveal} className="col-start-1 row-start-1 flex min-w-0 flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {reveal && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={reveal.correct ? "safe" : "scam"}>{reveal.correct ? "Correct" : "Not quite"}</Badge>
                <Badge tone={reveal.isScam ? "scam" : "safe"}>{reveal.isScam ? "It was a bluff" : "It was legit"}</Badge>
                <span className="text-xs text-dim">{reveal.category.replace(/_/g, " ")}</span>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <Header card={card} />
                <RevealBody card={card} reveal={reveal} />
              </div>
              <TapNote card={card} reveal={reveal} />
              {reveal.redFlags.length > 0
                ? <ul className="flex flex-col gap-1 text-sm">{reveal.redFlags.map((f) => <li key={f.span}><span className="font-medium text-scam">&ldquo;{f.span}&rdquo;</span> — {f.why}</li>)}</ul>
                : <p className="text-sm text-dim">{reveal.whyLegit ? `Why it's legit: ${reveal.whyLegit}` : "No red flags: nothing here asks for secrets, money or a rushed click."}</p>}
              {src && <span className="self-start" title={reveal.origin ?? undefined}><Badge tone={src.tone}>{src.label}</Badge></span>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
