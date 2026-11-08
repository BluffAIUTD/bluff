import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-gray-3 bg-surface/50 p-8 text-center">
      <p className="font-display text-xl italic">{title}</p>
      {hint && <p className="max-w-sm text-sm text-dim">{hint}</p>}
      {action}
    </div>
  );
}
