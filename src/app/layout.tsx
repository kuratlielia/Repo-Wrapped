import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// Body: Geist. Headings: Inter. No serif, no mono anywhere (PRD 7.2).
const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Repo Wrapped",
  description:
    "Paste a public GitHub repo and get your year in it, one swipeable, screenshot-ready story.",
  metadataBase: new URL("https://repo-wrapped.workers.dev"),
  openGraph: {
    title: "Repo Wrapped",
    description: "Your year in a repo, as a swipeable story.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Repo Wrapped",
    description: "Your year in a repo, as a swipeable story.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${inter.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
