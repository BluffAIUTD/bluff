"use client";
import Link from "next/link";
import { useState } from "react";
import { api, ApiFailure } from "@/lib/client/api";
import { Button } from "../ui/Button";
import { ErrorState } from "../ui/ErrorState";
import { GameCard, type CardData, type Reveal } from "./GameCard";

export type Bonus = { status: "ready"; card: CardData } | { status: "locked" };

/** After the daily five: one charge from the player's own Capital One scan (only they see it; not scored), or a nudge to scan. */
export function BonusCard({ bonus }: { bonus: Bonus }) {
  const [reveal, setReveal] = useState<Reveal | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (bonus.status === "locked") {
    return (
      <section aria-label="Bonus card" className="flex flex-col gap-2 rounded-card border border-dashed border-line p-4 text-sm">
        <Link href="/scan" className="font-medium text-accent underline">Scan your transactions to unlock a bonus card</Link>
        <p className="text-dim">Bluff checks the website behind each charge on your (sandbox) Capital One card, then turns one of them into a bonus card only you see.</p>
      </section>
    );
  }

  async function guess(g: "legit" | "scam") {
    if (bonus.status !== "ready") return;
    setBusy(true); setErr(null);
    try { setReveal(await api<Reveal>("/api/game/answer", { method: "POST", json: { cardId: bonus.card.id, guess: g } })); }
    catch (e) { setErr(e instanceof ApiFailure ? e.message : "Couldn't check that answer. Try again."); }
    finally { setBusy(false); }
  }

  return (
    <section aria-label="Bonus card" className="flex flex-col gap-3">
      <div>
        <h2 className="font-grotesk text-lg font-bold">Bonus: a charge from your own Capital One scan</h2>
        <p className="text-sm text-dim">Only you see this card. It isn&apos;t scored and isn&apos;t in your share grid.</p>
      </div>
      <GameCard card={bonus.card} reveal={reveal ?? undefined} />
      {err && <ErrorState message={err} />}
      {!reveal && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="min-h-[56px] text-base" disabled={busy} onClick={() => guess("legit")}>Legit</Button>
          <Button variant="danger" className="min-h-[56px] text-base" disabled={busy} onClick={() => guess("scam")}>Bluff!</Button>
        </div>
      )}
      {reveal && <Link href="/scan" className="self-start text-sm font-medium text-accent underline">See the full scan of this charge</Link>}
    </section>
  );
}
