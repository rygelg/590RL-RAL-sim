import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "katex/dist/katex.min.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RAL · Robustness-Aware LLM Leaderboards",
  description:
    "Interactive playground for the MGMT 590 final project. Watch 0.003% of votes flip the top-ranked LLM, then build the leaderboard that catches it.",
  authors: [
    { name: "Vikhyat Yashvanth Koppal" },
    { name: "Lichen Mao" },
    { name: "Rygel Ginete" },
  ],
  metadataBase: new URL("https://ral-playground.vercel.app"),
  openGraph: {
    title: "RAL · Robustness-Aware LLM Leaderboards",
    description: "Diagnose, repair, and harden Arena-style rankings. Live in your browser.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased">
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
