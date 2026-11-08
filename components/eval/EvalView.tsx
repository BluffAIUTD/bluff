import Link from "next/link";
import type { EvalResults } from "@/lib/eval";
import { EmptyState } from "../ui/EmptyState";
import { ClaimTable, compareF1 } from "./ClaimTable";
import { FailureCases } from "./FailureCases";
import { CalibrationTable, LiveStatsNote, NoLinkNote, PerCategoryTable } from "./ClaimADetails";
import type { ClaimA } from "@/lib/eval";

const isStandIn = (s: string) => /stand-?in|synthetic placeholder|not t-mobile/i.test(s);

export function EvalView({ results }: { results: EvalResults | null }) {
  if (!results) {
    return <EmptyState title="No evaluation has been run yet" hint="Results appear here once eval/results.json is committed. Run the scripts in scripts/eval (see the README)." />;
  }
  const a = results.claimA, b = results.claimB;
  return (
    <div className="flex flex-col gap-10">
      <p className="text-xs text-dim">Results generated {new Date(results.generated_at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} CT · loaded from the committed eval/results.json</p>

      {a ? (
        <div className="flex flex-col gap-4">
          {isStandIn(a.dataset) && <p role="note" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">Dataset: {a.dataset}. These numbers show the pipeline works; they are not a result on T-Mobile&apos;s data.</p>}
          <ClaimTable title="Claim A: detection" subtitle={`Scam vs. legit on a held-out split (${a.split}). Agent mode: ${a.mode}. Positive class = scam.`}
            verdict={compareF1(a.bluff.f1, a.baseline?.f1 ?? null)}
            rows={claimARows(a)} />
          {a.caveat && <p role="note" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">{a.caveat}</p>}
          {a.no_link_subset && a.methods && <NoLinkNote subset={a.no_link_subset} methods={a.methods} />}
          {a.category_accuracy != null && <p className="text-sm text-dim">Category accuracy against Bluff&apos;s taxonomy (scams flagged likely_scam): <b className="text-fg">{(a.category_accuracy * 100).toFixed(1)}%</b></p>}
          {a.live && <LiveStatsNote live={a.live} />}
          {a.methods && <CalibrationTable methods={a.methods.filter((m) => m.id !== "rules_sample")} model={a.confidence_model} />}
          {a.per_category && a.methods && <PerCategoryTable rows={a.per_category} methods={a.methods} />}
          <FailureCases title="Where Bluff is still wrong (Claim A)" items={a.failures} />
          {a.other_failures && a.other_failures.length > 0 && <FailureCases title={a.live ? "Other misses (the other Bluff mode)" : "Other misses"} items={a.other_failures} />}
        </div>
      ) : <EmptyState title="Claim A not run yet" />}

      {b ? (
        <div className="flex flex-col gap-4">
          {isStandIn(b.dataset) && <p role="note" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">Dataset: {b.dataset}.</p>}
          <ClaimTable title="Claim B: exposure-to-charge linking" subtitle={`Did the linker find the true source site? ${b.split}. Method: ${b.method}.`}
            verdict={compareF1(b.bluff.f1, b.baseline.f1)}
            rows={[{ method: "Bluff linker", n: b.n, prf: b.bluff, highlight: true, note: b.threshold != null ? `threshold ${b.threshold}` : undefined }, { method: "Naive substring match", n: b.n, prf: b.baseline }]} />
          {b.caveat && <p role="note" className="rounded-control border border-unsure/40 bg-unsure/10 px-3 py-2 text-sm">{b.caveat}</p>}
          <FailureCases title="Where the linker is still wrong (Claim B)" items={b.failures} />
          {b.baseline_failures && b.baseline_failures.length > 0 && <FailureCases title="Where the naive baseline fails (Claim B)" items={b.baseline_failures} />}
        </div>
      ) : <EmptyState title="Claim B not run yet" />}

      <section aria-label="Method" className="rounded-card border border-line bg-surface p-4 text-sm text-dim">
        <h3 className="mb-2 font-grotesk text-lg font-bold text-fg">How to read this</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>Splits are fixed and committed before any tuning. Thresholds were tuned on the dev split only; every number above is on the held-out split.</li>
          <li>Small test sets mean wide error bars. Treat differences of a few points as noise.</li>
          <li>Failure cases are listed on purpose: they show what Bluff still gets wrong.</li>
        </ul>
        <p className="mt-3"><Link href="/privacy" className="text-accent underline">What Bluff sends and never sends</Link></p>
      </section>
    </div>
  );
}

/** Claim A rows: every evaluated method when the detailed results are present, else Bluff vs. the baseline. */
function claimARows(a: ClaimA) {
  if (a.methods?.length) {
    const head = a.headline ?? a.methods.find((m) => m.prf.f1 === a.bluff.f1 && m.id !== "baseline")?.id;
    return a.methods.map((m) => ({ method: m.name, n: m.n, prf: m.prf, accuracy: m.accuracy, note: m.note, highlight: m.id === head }));
  }
  return [
    { method: "Bluff (unsure counted as scam)", n: a.n, prf: a.bluff, highlight: true },
    ...(a.unsure_as_legit ? [{ method: "Bluff (unsure counted as legit)", n: a.n, prf: a.unsure_as_legit }] : []),
    { method: a.baseline_name ?? "Provided baseline", n: a.n, prf: a.baseline },
  ];
}
