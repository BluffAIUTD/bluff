import type { ReactNode } from "react";

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card border border-scam/50 bg-scam/10 p-4">
      <p className="font-grotesk text-lg font-semibold text-[#ff9b90]">{title}</p>
      {message && <p className="text-sm text-fg">{message}</p>}
      {action}
    </div>
  );
}
