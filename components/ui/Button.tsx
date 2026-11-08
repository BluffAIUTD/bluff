import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
const V: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-gray-6",
  secondary: "bg-transparent text-fg border border-ink hover:bg-ink hover:text-paper",
  danger: "bg-scam text-white hover:brightness-90",
  ghost: "text-dim underline decoration-gray-3 underline-offset-4 hover:text-fg",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold tracking-[.01em] transition duration-ui disabled:cursor-not-allowed disabled:opacity-50 ${V[variant]} ${className}`}
    />
  );
}
