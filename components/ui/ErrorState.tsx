import type { ReactNode } from "react";

export function ErrorState({ title = "Something went wrong", message, action }: { title?: string; message?: string; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card border border-scam/40 bg-scam/[0.07] p-4">
      <p className="label !text-scam">Error</p>
      <p className="font-medium text-scam">{title}</p>
      {message && <p className="text-sm text-fg">{message}</p>}
      {action}
    </div>
  );
}
