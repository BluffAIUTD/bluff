import { readEvalResults } from "@/lib/eval";
import { EvalView } from "@/components/eval/EvalView";

export const metadata = { title: "Proof — Bluff" };
export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-4xl font-semibold tracking-tight">Does it work?</h1>
        <p className="text-dim">Two claims, measured against baselines, with the failures shown.</p>
      </header>
      <EvalView results={readEvalResults()} />
    </div>
  );
}
