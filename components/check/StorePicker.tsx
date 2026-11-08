import { STORES } from "@/data/stores";

/** The 8 demo storefronts as chips (3 scam, 5 legit; the mix is not revealed on the chips). */
export function StorePicker({ selected, onPick, disabled }: { selected: string | null; onPick: (slug: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Demo stores" className="flex flex-wrap gap-2">
      {STORES.map((s) => (
        <button key={s.slug} type="button" disabled={disabled} onClick={() => onPick(s.slug)} aria-pressed={selected === s.slug}
          className={`min-h-[44px] rounded-control border px-3.5 font-mono text-[13px] transition duration-ui disabled:opacity-50 ${selected === s.slug ? "border-ink bg-ink font-bold text-paper" : "border-gray-3 bg-surface hover:border-ink"}`}>
          {s.slug}
        </button>
      ))}
    </div>
  );
}
