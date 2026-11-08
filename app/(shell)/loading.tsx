/** Shown while a server page fetches: three cards being dealt. */
export default function Loading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col items-center gap-6 py-24">
      <div aria-hidden className="relative h-[130px] w-[220px]">
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute left-1/2 top-2" style={{ transform: `translateX(calc(-50% + ${(i - 1) * 46}px)) rotate(${(i - 1) * 9}deg)` }}>
            <div className="card-back deal h-[110px] w-[78px] rounded-[8px]" style={{ ["--i" as string]: i, animationDuration: "700ms" }} />
          </div>
        ))}
      </div>
      <p className="text-sm text-dim">Dealing…</p>
    </div>
  );
}
