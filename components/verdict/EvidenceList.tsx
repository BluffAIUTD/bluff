import { toneFor } from "./tone";

const letter = (i: number) => String.fromCharCode(65 + (i % 26));

/** Evidence as lettered exhibits. `from` offsets the lettering when exhibits already appear above (the Thread uses A and B). */
export function EvidenceList({ items, score, from = 0 }: { items: string[]; score: number; from?: number }) {
  const tone = toneFor(score);
  return (
    <ul className="flex flex-col" aria-label="Evidence">
      {items.map((e, i) => (
        <li key={i} className="grid grid-cols-[4.5rem_1fr] gap-3 border-t border-line py-2.5 text-[15px] first:border-t-0 first:pt-0">
          <span aria-hidden className={`exhibit pt-[3px] ${tone.text}`}>Ex. {letter(from + i)}</span>
          <span>{e}</span>
        </li>
      ))}
    </ul>
  );
}
