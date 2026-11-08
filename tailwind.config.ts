import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", paper: "var(--paper)", scam: "rgb(var(--scam-rgb) / <alpha-value>)", unsure: "rgb(var(--unsure-rgb) / <alpha-value>)",
        safe: "rgb(var(--safe-rgb) / <alpha-value>)", accent: "rgb(var(--accent-rgb) / <alpha-value>)", onaccent: "var(--on-accent)",
        bg: "var(--bg)", surface: "var(--surface)", surface2: "var(--surface-2)", surface3: "var(--surface-3)", line: "var(--border)", line2: "var(--border-strong)",
        fg: "var(--text)", dim: "var(--text-dim)",
        gray: { 1: "var(--gray-1)", 2: "var(--gray-2)", 3: "var(--gray-3)", 4: "var(--gray-4)", 5: "var(--gray-5)", 6: "var(--gray-6)", 400: "var(--gray-3)", 500: "var(--gray-4)" },
      },
      borderRadius: { control: "8px", card: "14px" },
      transitionDuration: { ui: "160ms" },
      fontFamily: {
        grotesk: ["var(--font-geist)", "system-ui", "sans-serif"],
        sans: ["var(--font-geist)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
