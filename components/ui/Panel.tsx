import type { ReactNode } from "react";

/** Uppercase mono micro-label. */
export function Label({ children, className = "", as: Tag = "p", id }: { children: ReactNode; className?: string; as?: "p" | "h2" | "h3" | "span"; id?: string }) {
  return <Tag id={id} className={`label ${className}`}>{children}</Tag>;
}

/** Titled bento tile. */
export function Tile({ label, right, children, className = "", tone, ariaLabel }: { label?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; tone?: "safe" | "scam" | "unsure"; ariaLabel?: string }) {
  return (
    <section aria-label={ariaLabel} className={`panel flex min-w-0 flex-col gap-3 p-4 ${tone ? `panel-glow-${tone}` : ""} ${className}`}>
      {(label || right) && (
        <header className="flex items-center justify-between gap-2">
          {label && <h2 className="label">{label}</h2>}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}
