import { readEvalResults } from "@/lib/eval";
import { EvalView } from "@/components/eval/EvalView";

export const metadata = { title: "Proof — Bluff" };
export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2 border-b-2 border-ink pb-5">
        <p className="eyebrow">Proof</p>
        <h1 className="font-display text-[38px] font-semibold leading-[1.05] tracking-tight sm:text-5xl">Does it work?</h1>
        <p className="max-w-2xl text-lg text-dim">Two claims, measured against baselines, with the failures shown.</p>
      </header>
      <EvalView results={readEvalResults()} />
    </div>
  );
}
