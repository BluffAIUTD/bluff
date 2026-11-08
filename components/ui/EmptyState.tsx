import type { ReactNode } from "react";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-line2 bg-surface/50 p-8 text-center">
      <span aria-hidden className="mb-1 grid h-10 w-10 place-items-center rounded-full border border-line2">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-4" />
      </span>
      <p className="text-base font-medium">{title}</p>
      {hint && <p className="max-w-sm text-sm text-dim">{hint}</p>}
      {action}
    </div>
  );
}
