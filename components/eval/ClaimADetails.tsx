import type { ClaimA, EvalMethod } from "@/lib/eval";

const pct = (n: number | null | undefined) => (n == null ? "–" : `${(n * 100).toFixed(1)}%`);
const pct0 = (n: number | null | undefined) => (n == null ? "–" : `${Math.round(n * 100)}%`);

/** Short column labels for the methods scripts/eval/claim_a.ts writes; unknown ids fall back to their full name. */
const SHORT: Record<string, string> = { baseline: "Link baseline", rules_v0: "Rules before", rules: "Rules after", live: "Live agent", rules_sample: "Rules after (sample)" };
export const shortName = (m: Pick<EvalMethod, "id" | "name">) => SHORT[m.id] ?? m.name;

const card = "overflow-x-auto rounded-card border border-line bg-surface";
const th = "px-3 py-2";

/** Stated confidence vs. how often committed verdicts were right, per confidence bucket, for each method that states one. */
export function CalibrationTable({ methods, model }: { methods: EvalMethod[]; model?: ClaimA["confidence_model"] }) {
  const ms = methods.filter((m) => m.calibration && m.calibration.n > 0);
  if (!ms.length) return null;
  const ranges = ms[0].calibration!.buckets.map((b) => b.range);
  return (
    <section aria-label="Honest confidence" className="flex flex-col gap-3">
      <h3 className="font-grotesk text-lg font-bold">Honest confidence: stated vs. observed</h3>
      <p className="text-sm text-dim">
        For each confidence range: what Bluff said (stated) and how often it was right (observed). Lower ECE (expected calibration error) is better.
        Unsure verdicts claim nothing and are left out. Confidence comes from how many signals agree, never from the model&apos;s own say-so.
      </p>
      <div className={card}>
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-dim">
            <tr><th className={th}>Confidence</th>{ms.map((m) => <th key={m.id} className={th}>{shortName(m)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {ranges.map((range, i) => (
              <tr key={range}>
                <th scope="row" className={`${th} font-medium`}>{range}</th>
                {ms.map((m) => {
                  const b = m.calibration!.buckets[i];
                  return <td key={m.id} className={`num ${th}`}>{b?.n ? <>{pct0(b.stated)} → <b>{pct0(b.observed)}</b> <span className="text-dim">(n={b.n})</span></> : <span className="text-dim">–</span>}</td>;
                })}
              </tr>
            ))}
            <tr className="bg-surface2">
              <th scope="row" className={`${th} font-medium`}>ECE</th>
              {ms.map((m) => <td key={m.id} className={`num ${th} font-bold`}>{m.calibration!.ece.toFixed(3)} <span className="font-normal text-dim">(n={m.calibration!.n})</span></td>)}
            </tr>
          </tbody>
        </table>
      </div>
      {model && <p className="text-xs text-dim">Confidence model ({model.fitted_on}): {model.formula}; floor {model.floor}, cap {model.cap}, tau {model.tau}.</p>}
    </section>
  );
}

/** Messages each method got right (scam vs. legit), per category of the dataset. */
export function PerCategoryTable({ rows, methods }: { rows: NonNullable<ClaimA["per_category"]>; methods: EvalMethod[] }) {
  if (!rows.length) return null;
  const ids = Object.keys(rows[0].correct);
  const name = (id: string) => { const m = methods.find((x) => x.id === id); return m ? shortName(m) : SHORT[id] ?? id; };
  return (
    <details className="rounded-card border border-line bg-surface">
      <summary className="cursor-pointer px-4 py-3 font-grotesk text-lg font-bold">Per category ({rows.length} categories)</summary>
      <p className="px-4 pb-2 text-sm text-dim">Correct scam/legit calls out of n. With 3–5 messages per category these are anecdotes, not rates.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-dim">
            <tr><th className={th}>Category</th><th className={th}>n</th>{ids.map((id) => <th key={id} className={th}>{name(id)}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.category}>
                <th scope="row" className={`${th} font-mono text-[13px] font-normal`}>{r.category}<span className="ml-1 text-xs text-dim">{r.label}</span></th>
                <td className={`num ${th}`}>{r.n}</td>
                {ids.map((id) => <td key={id} className={`num ${th} ${r.correct[id] === r.n ? "" : "text-unsure"}`}>{r.correct[id]}/{r.n}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** How the live Nemotron agent was run: model, sample, fallbacks and latency. */
export function LiveStatsNote({ live }: { live: NonNullable<ClaimA["live"]> }) {
  return (
    <section aria-label="Live agent run" className="rounded-card border border-line bg-surface p-4 text-sm">
      <h3 className="mb-2 font-grotesk text-lg font-bold">Live agent run</h3>
      <ul className="list-disc space-y-1 pl-5 text-dim">
        <li>Model <span className="font-mono text-fg">{live.model}</span> with tools taxonomy_match, domain_intel and submit_verdict, rules fallback as deployed.</li>
        <li>{live.full_test_split ? `All ${live.n} test messages.` : `${live.n} test messages: ${live.sample}. Not the whole test split.`}</li>
        <li>{live.from_model} of {live.n} verdicts came from Nemotron; {live.fell_back} fell back to the rules.</li>
        <li>Latency per message: p50 <b className="num text-fg">{((live.latency_ms.p50 ?? 0) / 1000).toFixed(1)} s</b>, p95 <b className="num text-fg">{((live.latency_ms.p95 ?? 0) / 1000).toFixed(1)} s</b>{live.pacing ? ` (${live.pacing})` : ""}.</li>
      </ul>
    </section>
  );
}

/** The no-link subset: link signals are unusually strong in this synthetic set, so show results without them. */
export function NoLinkNote({ subset, methods }: { subset: NonNullable<ClaimA["no_link_subset"]>; methods: EvalMethod[] }) {
  const entries = Object.entries(subset.methods);
  if (!entries.length) return null;
  const name = (id: string) => { const m = methods.find((x) => x.id === id); return m ? shortName(m) : SHORT[id] ?? id; };
  return (
    <p className="text-sm text-dim">
      Messages with no link (n={subset.n}, {subset.scam} scams), F1:{" "}
      {entries.map(([id, p], i) => <span key={id}>{i ? " · " : ""}{name(id)} <b className="num text-fg">{pct(p.f1)}</b></span>)}
    </p>
  );
}
