"use client";
import { highlightSpans } from "@/lib/client/highlight";
import { Badge } from "../ui/Badge";

export type CardData = { id: string; kind: string; content: { from?: string; subject?: string; body: string }; source?: string; origin?: string | null };

const SOURCE: Record<string, { label: string; tone: "accent" | "safe" | "neutral" }> = {
  dataset: { label: "Scam message set", tone: "accent" },
  tmobile: { label: "Imported message set", tone: "accent" },
  bank: { label: "From your Capital One scan", tone: "safe" },
  generated: { label: "Nemotron-generated", tone: "neutral" },
  lookalike: { label: "This week's trending scam", tone: "neutral" },
};
export type Reveal = { correct: boolean; isScam: boolean; redFlags: { span: string; why: string }[]; category: string; guess: "legit" | "scam" };

const KIND: Record<string, string> = { text: "Text message", checkout: "Checkout page", email: "Email", receipt: "Receipt", bank_alert: "Bank alert" };

function Body({ card, reveal }: { card: CardData; reveal?: Reveal }) {
  const segs = reveal ? highlightSpans(card.content.body, reveal.redFlags) : [{ text: card.content.body }];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs text-dim">
        <span className="font-medium uppercase tracking-wide">{KIND[card.kind] ?? card.kind}</span>
        {card.content.from && <span className="truncate pl-2">{card.content.from}</span>}
      </div>
      {card.source && SOURCE[card.source] && <span className="self-start" title={card.origin ?? undefined}><Badge tone={SOURCE[card.source].tone}>{SOURCE[card.source].label}</Badge></span>}
      {card.content.subject && <p className="font-grotesk text-lg font-bold">{card.content.subject}</p>}
      <p className="text-[17px] leading-relaxed">
        {segs.map((s, i) => s.why
          ? <mark key={i} title={s.why} className="rounded bg-scam/30 px-0.5 text-fg underline decoration-scam decoration-2 underline-offset-2">{s.text}</mark>
          : <span key={i}>{s.text}</span>)}
      </p>
    </div>
  );
}

/** A literal card: flips (400 ms) after you answer; red-flag spans light up with a one-line why each. */
export function GameCard({ card, reveal }: { card: CardData; reveal?: Reveal }) {
  return (
    <div className="[perspective:1200px]">
      <div className={`grid transition-transform duration-[400ms] [transform-style:preserve-3d] ${reveal ? "[transform:rotateY(180deg)]" : ""}`}>
        <div aria-hidden={!!reveal} className="col-start-1 row-start-1 rounded-card border border-line bg-surface p-5 shadow-lg [backface-visibility:hidden]">
          <Body card={card} />
        </div>
        <div aria-hidden={!reveal} className="col-start-1 row-start-1 flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-lg [backface-visibility:hidden] [transform:rotateY(180deg)]">
          {reveal && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={reveal.correct ? "safe" : "scam"}>{reveal.correct ? "Correct" : "Not quite"}</Badge>
                <Badge tone={reveal.isScam ? "scam" : "safe"}>{reveal.isScam ? "It was a bluff" : "It was legit"}</Badge>
                <span className="text-xs text-dim">{reveal.category.replace(/_/g, " ")}</span>
              </div>
              <Body card={card} reveal={reveal} />
              {reveal.redFlags.length > 0
                ? <ul className="flex flex-col gap-1 text-sm">{reveal.redFlags.map((f) => <li key={f.span}><span className="font-medium text-scam">&ldquo;{f.span}&rdquo;</span> — {f.why}</li>)}</ul>
                : <p className="text-sm text-dim">No red flags: nothing here asks for secrets, money or a rushed click.</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
