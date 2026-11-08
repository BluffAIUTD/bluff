import { STORES } from "@/data/stores";

/** The 10 demo storefronts as chips (5 scam, 5 legit; the mix is not revealed on the chips). */
export function StorePicker({ selected, onPick, disabled }: { selected: string | null; onPick: (slug: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Demo stores" className="flex flex-wrap gap-2">
      {STORES.map((s) => (
        <button key={s.slug} type="button" disabled={disabled} onClick={() => onPick(s.slug)} aria-pressed={selected === s.slug}
          className={`min-h-[44px] rounded-full border px-4 text-sm font-medium transition duration-ui disabled:opacity-50 ${selected === s.slug ? "border-accent bg-accent/20" : "border-line bg-surface hover:border-gray-4"}`}>
          {s.slug}
        </button>
      ))}
    </div>
  );
}
