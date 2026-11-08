import { readEvalResults } from "@/lib/eval";
import { EvalView } from "@/components/eval/EvalView";

export const metadata = { title: "Proof of work" };
export const dynamic = "force-dynamic";

export default function EvalPage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-[34px] font-semibold leading-[1.08] tracking-tight sm:text-5xl">Proof: does it work?</h1>
        <p className="text-dim">Two claims, measured against baselines, with the failures shown.</p>
      </header>
      <EvalView results={readEvalResults()} />
    </div>
  );
}
