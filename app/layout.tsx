import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";

const ui = Manrope({ subsets: ["latin"], variable: "--font-ui", display: "swap" });
const display = Fraunces({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Bluff: call their bluff", template: "%s | Bluff" },
  description: "Bluff checks the website behind every charge on your card and helps you get your money back.",
  applicationName: "Bluff",
  openGraph: { title: "Bluff: call their bluff", description: "A scam co-pilot with memory that checks the website behind every charge on your card.", type: "website" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0a2a1f" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${ui.variable} ${display.variable}`}>
      <body>{children}</body>
    </html>
  );
}
