import { STORES } from "@/data/stores";
import { ChipDisc, type ChipTone } from "../table/chips";

/** Rack colors are decoration only: they follow the list order and never hint at which stores are risky. */
const RACK: ChipTone[] = ["blue", "ivory", "black", "brass"];

/** The 10 demo storefronts as chips in a rack (5 scam, 5 legit; the mix is not revealed on the chips). */
export function StorePicker({ selected, onPick, disabled }: { selected: string | null; onPick: (slug: string) => void; disabled?: boolean }) {
  return (
    <div role="group" aria-label="Demo stores" className="flex flex-wrap gap-2.5">
      {STORES.map((s, i) => {
        const on = selected === s.slug;
        return (
          <button key={s.slug} type="button" disabled={disabled} onClick={() => onPick(s.slug)} aria-pressed={on}
            className={`chip-btn btn-rail inline-flex min-h-[48px] items-center gap-2.5 rounded-full py-1 pl-1 pr-4 text-sm font-semibold disabled:opacity-50 ${on ? "!border-[#f1d894] shadow-[0_0_0_2px_rgba(241,216,148,0.35),0_6px_16px_-6px_rgba(0,0,0,0.8)]" : ""}`}>
            <ChipDisc tone={RACK[i % RACK.length]} size={36} />
            {s.slug}
          </button>
        );
      })}
    </div>
  );
}
