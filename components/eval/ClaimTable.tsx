import { Badge } from "../ui/Badge";

type Prf = { p: number; r: number; f1: number };
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export type ClaimRow = { method: string; n: number; prf: Prf | null; highlight?: boolean; note?: string };

/** One claim: method, n, precision / recall / F1 for Bluff and each baseline. Higher F1 gets a "wins" mark only if it truly is higher. */
export function ClaimTable({ title, subtitle, rows, verdict }: { title: string; subtitle: string; rows: ClaimRow[]; verdict?: { text: string; tone: "safe" | "scam" | "unsure" } }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-grotesk text-xl font-bold">{title}</h2>
        {verdict && <Badge tone={verdict.tone}>{verdict.text}</Badge>}
      </div>
      <p className="text-sm text-dim">{subtitle}</p>
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-dim">
            <tr><th className="px-4 py-3">Method</th><th className="px-4 py-3">n</th><th className="px-4 py-3">Precision</th><th className="px-4 py-3">Recall</th><th className="px-4 py-3">F1</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.method} className={r.highlight ? "bg-accent/10" : ""}>
                <th scope="row" className="px-4 py-3 font-medium">{r.method}{r.note && <span className="block text-xs font-normal text-dim">{r.note}</span>}</th>
                <td className="num px-4 py-3">{r.n}</td>
                {r.prf ? <><td className="num px-4 py-3">{pct(r.prf.p)}</td><td className="num px-4 py-3">{pct(r.prf.r)}</td><td className="num px-4 py-3 font-bold">{pct(r.prf.f1)}</td></>
                  : <td colSpan={3} className="px-4 py-3 text-dim">Not available</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Honest verdict text from the numbers. Ties and losses are reported as such. */
export function compareF1(bluff: number, baseline: number | null): { text: string; tone: "safe" | "scam" | "unsure" } | undefined {
  if (baseline == null) return undefined;
  const d = bluff - baseline;
  if (Math.abs(d) < 0.005) return { text: "Tied with the baseline", tone: "unsure" };
  return d > 0 ? { text: `Beats the baseline by ${(d * 100).toFixed(1)} F1 pts`, tone: "safe" } : { text: `Below the baseline by ${(-d * 100).toFixed(1)} F1 pts`, tone: "scam" };
}
