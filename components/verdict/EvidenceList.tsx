import { toneFor } from "./tone";

export function EvidenceList({ items, score }: { items: string[]; score: number }) {
  const tone = toneFor(score);
  return (
    <section aria-label="Evidence section">
      <h3 className="label mb-3">Evidence</h3>
      <ul className="flex flex-col gap-2.5" aria-label="Evidence">
        {items.map((e, i) => (
          <li key={i} className="flex gap-3 text-sm leading-snug">
            <span aria-hidden className={`mono mt-px text-[11px] ${tone.text}`}>{String(i + 1).padStart(2, "0")}</span>
            <span>{e}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
