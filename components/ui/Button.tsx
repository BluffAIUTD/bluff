import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const V: Record<Variant, string> = {
  primary: "bg-accent text-white hover:brightness-110",
  secondary: "bg-surface2 text-fg border border-line hover:border-gray-4",
  danger: "bg-scam text-white hover:brightness-110",
  ghost: "text-dim hover:text-fg",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition duration-ui disabled:cursor-not-allowed disabled:opacity-50 ${V[variant]} ${className}`}
    />
  );
}
