import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed brass-hairline p-8 text-center">
      <span aria-hidden className="mb-1 flex -space-x-2">
        {[0, 1, 2].map((i) => <span key={i} className="h-9 w-6 rounded-[4px] border border-accent/40 bg-white/5" style={{ transform: `rotate(${(i - 1) * 9}deg) translateY(${i === 1 ? -3 : 0}px)` }} />)}
      </span>
      <p className="font-grotesk text-xl font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-dim">{hint}</p>}
      {action}
    </div>
  );
}
