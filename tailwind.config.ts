import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", paper: "var(--paper)", scam: "rgb(var(--scam-rgb) / <alpha-value>)", unsure: "rgb(var(--unsure-rgb) / <alpha-value>)",
        safe: "rgb(var(--safe-rgb) / <alpha-value>)", accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        bg: "var(--bg)", surface: "var(--surface)", surface2: "var(--surface-2)", line: "var(--border)", rule: "var(--rule)",
        fg: "var(--text)", dim: "var(--text-dim)",
        gray: { 1: "var(--gray-1)", 2: "var(--gray-2)", 3: "var(--gray-3)", 4: "var(--gray-4)", 5: "var(--gray-5)", 6: "var(--gray-6)" },
      },
      borderRadius: { control: "3px", card: "4px" },
      transitionDuration: { ui: "180ms" },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
