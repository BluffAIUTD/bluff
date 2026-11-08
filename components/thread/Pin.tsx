/** A map pin head the thread is tied to. Sits on a positioned wrapper so its pop-in animation never fights positioning. */
export function PinHead({ color, delayed, className = "" }: { color: string; delayed?: boolean; className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none absolute z-10 ${className}`}>
      <span className={`block h-[14px] w-[14px] rounded-full border-2 border-bg shadow-[0_1px_2px_rgb(0_0_0/.35)] ${delayed ? "thread-pin" : "thread-pin-start"}`}
        style={{ background: `radial-gradient(circle at 35% 30%, #fff8 0 14%, transparent 15%), ${color}` }} />
    </span>
  );
}
