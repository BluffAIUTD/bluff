export type GameStats = { played: number; winPct: number; perfectPct: number; currentStreak: number; maxStreak: number; dist: number[] };

/** Wordle-style stats: five numbers and a 0-5 score histogram with the given score's bar highlighted. */
export function Stats({ stats, highlight }: { stats: GameStats; highlight: number | null }) {
  const max = Math.max(1, ...stats.dist);
  const tiles: [string, number][] = [["Played", stats.played], ["Win %", stats.winPct], ["Perfect %", stats.perfectPct], ["Current streak", stats.currentStreak], ["Max streak", stats.maxStreak]];
  return (
    <section aria-label="Statistics" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4">
      <h2 className="font-grotesk text-sm font-medium uppercase tracking-wide text-dim">Your stats</h2>
      <dl className="grid grid-cols-5 gap-1 text-center">
        {tiles.map(([label, v]) => (
          <div key={label} className="flex flex-col-reverse items-center gap-1">
            <dt className="text-[11px] leading-tight text-dim">{label}</dt>
            <dd className="num text-2xl font-bold">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-dim">Score distribution <span className="font-normal">(win = 4 or 5 right)</span></h3>
        <ol aria-label="Score distribution" className="flex flex-col gap-1">
          {stats.dist.map((n, score) => {
            const on = highlight === score;
            return (
              <li key={score} className="flex items-center gap-2 text-xs" data-current={on || undefined}>
                <span aria-hidden className="num w-3 text-right text-dim">{score}</span>
                <span aria-hidden className="flex-1">
                  <span style={{ width: `${Math.max(8, Math.round((n / max) * 100))}%` }}
                    className={`num flex justify-end rounded-sm px-1.5 py-0.5 font-bold ${on ? "bg-accent text-white" : "bg-surface2 text-fg"}`}>{n}</span>
                </span>
                <span className="sr-only">{score} right: {n} {n === 1 ? "game" : "games"}{on ? " (this game)" : ""}</span>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
