import { readEvalResults } from "@/lib/eval";
import { EvalView } from "@/components/eval/EvalView";

export const metadata = { title: "Proof | Bluff" };
export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="max-w-2xl">
        <p className="label">Proof</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Does it work?</h1>
        <p className="mt-2 text-dim">Two claims, measured against baselines, with the failures shown.</p>
      </header>
      <EvalView results={readEvalResults()} />
    </div>
  );
}
