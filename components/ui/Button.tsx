import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

const V: Record<Variant, string> = {
  primary: "btn-brass",
  secondary: "btn-rail",
  danger: "btn-scam",
  ghost: "text-dim hover:text-fg",
};

export function Button({ variant = "primary", className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold tracking-[0.01em] transition duration-ui disabled:cursor-not-allowed disabled:opacity-50 ${V[variant]} ${className}`}
    />
  );
}
