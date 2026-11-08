import "./globals.css";
import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-inter", display: "swap" });
const grotesk = Space_Grotesk({ subsets: ["latin"], weight: ["500", "700"], variable: "--font-grotesk", display: "swap" });

export const metadata: Metadata = { title: "Bluff — call their bluff", description: "Bluff checks the website behind every charge on your card and helps you get your money back." };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0e1014" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${grotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
