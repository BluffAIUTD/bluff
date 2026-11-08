import { STORES } from "@/data/stores";

/** The demo storefronts as chips (the scam/legit mix is not revealed on the chips). */
export function StorePicker({ selected, onPick, disabled }: { selected: string | null; onPick: (slug: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Demo stores" className="flex flex-wrap gap-2">
      {STORES.map((s) => (
        <button key={s.slug} type="button" disabled={disabled} onClick={() => onPick(s.slug)} aria-pressed={selected === s.slug}
          className={`mono min-h-[40px] rounded-control border px-3 text-[13px] transition duration-ui disabled:opacity-50 ${selected === s.slug ? "border-accent/60 bg-accent/10 text-accent shadow-[0_0_20px_-8px_var(--accent)]" : "border-line2 bg-surface2 text-gray-2 hover:border-gray-4 hover:text-fg"}`}>
          {s.slug}
        </button>
      ))}
    </div>
  );
}
