import { toneFor } from "./tone";

export function EvidenceList({ items, score }: { items: string[]; score: number }) {
  const tone = toneFor(score);
  return (
    <ul className="flex flex-col gap-2.5" aria-label="Evidence">
      {items.map((e, i) => (
        <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
          <span aria-hidden className={`mt-[7px] h-2 w-2 shrink-0 rotate-45 rounded-[1px] ${tone.text} bg-current`} />
          <span>{e}</span>
        </li>
      ))}
    </ul>
  );
}
