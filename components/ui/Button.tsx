import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const V: Record<Variant, string> = {
  primary: "bg-accent text-onaccent shadow-[0_0_24px_-6px_rgb(var(--accent-rgb)/0.7)] hover:brightness-110",
  secondary: "bg-surface2 text-fg border border-line2 hover:border-gray-4 hover:bg-surface3",
  danger: "bg-scam text-[#1a0604] hover:brightness-110",
  ghost: "text-dim hover:text-fg hover:bg-surface2",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition duration-ui disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none ${V[variant]} ${className}`}
    />
  );
}
