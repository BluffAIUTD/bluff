import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)", paper: "var(--paper)", scam: "var(--scam)", unsure: "var(--unsure)",
        safe: "var(--safe)", accent: "var(--accent)",
        bg: "var(--bg)", surface: "var(--surface)", surface2: "var(--surface-2)", line: "var(--border)",
        fg: "var(--text)", dim: "var(--text-dim)",
        gray: { 1: "var(--gray-1)", 2: "var(--gray-2)", 3: "var(--gray-3)", 4: "var(--gray-4)", 5: "var(--gray-5)", 6: "var(--gray-6)" },
      },
      borderRadius: { control: "8px", card: "16px" },
      spacing: { 1: "4px", 2: "8px", 3: "12px", 4: "16px", 6: "24px", 8: "32px", 12: "48px" },
      transitionDuration: { ui: "180ms" },
      fontFamily: { grotesk: ["var(--font-grotesk)", "system-ui", "sans-serif"], sans: ["var(--font-inter)", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
