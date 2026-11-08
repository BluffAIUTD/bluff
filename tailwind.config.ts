import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", paper: "var(--paper)", scam: "rgb(var(--scam-rgb) / <alpha-value>)", unsure: "rgb(var(--unsure-rgb) / <alpha-value>)",
        safe: "rgb(var(--safe-rgb) / <alpha-value>)", accent: "rgb(var(--accent-rgb) / <alpha-value>)",
        brass: "rgb(var(--accent-rgb) / <alpha-value>)",
        bg: "var(--bg)", surface: "var(--surface)", surface2: "var(--surface-2)", line: "var(--border)",
        fg: "var(--text)", dim: "var(--text-dim)",
        gray: { 1: "var(--gray-1)", 2: "var(--gray-2)", 3: "var(--gray-3)", 4: "var(--gray-4)", 5: "var(--gray-5)", 6: "var(--gray-6)" },
      },
      borderRadius: { control: "12px", card: "22px" },
      spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px" },
      transitionDuration: { ui: "180ms" },
      fontFamily: { grotesk: ["var(--font-display)", "Georgia", "serif"], display: ["var(--font-display)", "Georgia", "serif"], sans: ["var(--font-ui)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
