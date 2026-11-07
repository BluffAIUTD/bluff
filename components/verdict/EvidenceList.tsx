import { toneFor } from "./tone";

export function EvidenceList({ items, score }: { items: string[]; score: number }) {
  const tone = toneFor(score);
  return (
    <ul className="flex flex-col gap-2" aria-label="Evidence">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2 text-sm">
          <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${tone.text} bg-current`} />
          <span>{e}</span>
        </li>
      ))}
    </ul>
  );
}
