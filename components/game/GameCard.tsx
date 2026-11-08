"use client";
import { highlightSpans } from "@/lib/client/highlight";
import { FlipCard } from "../table/FlipCard";
import { CornerIndex } from "../table/PlayingCardFace";

export type CardData = { id: string; kind: string; content: { from?: string; subject?: string; body: string }; source?: string; origin?: string | null };

const SOURCE: Record<string, string> = {
  dataset: "Scam message set",
  tmobile: "Imported message set",
  bank: "From your Capital One scan",
  generated: "Nemotron-generated",
  lookalike: "This week's trending scam",
};

export type Reveal = { correct: boolean; isScam: boolean; redFlags: { span: string; why: string }[]; category: string; guess: "legit" | "scam" };

const KIND: Record<string, string> = { text: "Text message", checkout: "Checkout page", email: "Email", receipt: "Receipt", bank_alert: "Bank alert" };

function Chipped({ tone, children }: { tone: "good" | "bad" | "plain"; children: React.ReactNode }) {
  const cls = tone === "good" ? "border-[#17734c]/60 bg-[#17734c]/10 text-[#0f5a3a]" : tone === "bad" ? "border-[#b3281f]/60 bg-[#b3281f]/10 text-[#8e1d16]" : "border-[#6a5a36]/40 bg-[#6a5a36]/10 text-[#5a4a2a]";
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-[2px] text-xs font-bold ${cls}`}>{children}</span>;
}

function Body({ card, reveal }: { card: CardData; reveal?: Reveal }) {
  const segs = reveal ? highlightSpans(card.content.body, reveal.redFlags) : [{ text: card.content.body }];
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2 text-xs text-[#5a4a2a]">
        <span className="font-bold uppercase tracking-[0.14em]">{KIND[card.kind] ?? card.kind}</span>
        {card.content.from && <span className="truncate pl-2">{card.content.from}</span>}
      </div>
      {card.source && SOURCE[card.source] && <span className="self-start" title={card.origin ?? undefined}><Chipped tone={card.source === "bank" ? "good" : "plain"}>{SOURCE[card.source]}</Chipped></span>}
      {card.content.subject && <p className="serif text-xl font-bold">{card.content.subject}</p>}
      <p className="text-[17px] leading-relaxed">
        {segs.map((s, i) => s.why
          ? <mark key={i} title={s.why} className="rounded bg-[#b3281f]/20 px-0.5 text-[inherit] underline decoration-[#b3281f] decoration-2 underline-offset-2">{s.text}</mark>
          : <span key={i}>{s.text}</span>)}
      </p>
    </div>
  );
}

/** A literal playing card: flips after you answer; red-flag spans light up with a one-line why each. */
export function GameCard({ card, reveal, rank }: { card: CardData; reveal?: Reveal; rank?: number }) {
  return (
    <FlipCard
      flipped={!!reveal}
      className="mx-auto w-full max-w-[560px]"
      front={
        <div aria-hidden={!!reveal} className="card-face relative flex min-h-[300px] flex-col justify-center rounded-[16px] px-6 py-10 pl-16 sm:px-12 sm:pl-20">
          <span aria-hidden className="pointer-events-none absolute inset-[8px] rounded-[11px] border" style={{ borderColor: "rgba(120,90,30,0.28)" }} />
          <CornerIndex rank={rank ?? ""} suit="unsure" />
          <CornerIndex rank={rank ?? ""} suit="unsure" flip />
          <Body card={card} />
        </div>
      }
      back={
        <div aria-hidden={!reveal} className="card-face relative flex min-h-[300px] flex-col gap-4 rounded-[16px] px-6 py-10 pl-16 sm:px-12 sm:pl-20">
          <span aria-hidden className="pointer-events-none absolute inset-[8px] rounded-[11px] border" style={{ borderColor: "rgba(120,90,30,0.28)" }} />
          {reveal && (
            <>
              <CornerIndex rank={rank ?? ""} suit={reveal.isScam ? "scam" : "safe"} />
              <CornerIndex rank={rank ?? ""} suit={reveal.isScam ? "scam" : "safe"} flip />
              <div className="flex flex-wrap items-center gap-2">
                <Chipped tone={reveal.correct ? "good" : "bad"}>{reveal.correct ? "Correct" : "Not quite"}</Chipped>
                <Chipped tone={reveal.isScam ? "bad" : "good"}>{reveal.isScam ? "It was a bluff" : "It was legit"}</Chipped>
                <span className="text-xs text-[#5a4a2a]">{reveal.category.replace(/_/g, " ")}</span>
              </div>
              <Body card={card} reveal={reveal} />
              {reveal.redFlags.length > 0
                ? <ul className="flex flex-col gap-1.5 text-sm">{reveal.redFlags.map((f) => <li key={f.span}><span className="font-bold text-[#8e1d16]">&ldquo;{f.span}&rdquo;</span> {f.why}</li>)}</ul>
                : <p className="text-sm text-[#4d4128]">No red flags: nothing here asks for secrets, money or a rushed click.</p>}
            </>
          )}
        </div>
      }
    />
  );
}
