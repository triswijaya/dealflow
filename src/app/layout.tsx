import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { env } from "@/server/env";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The app and the landing page read Geist for text and Geist Mono for figures (the refined prototype).
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

export const metadata: Metadata = {
  // Makes relative Open Graph and icon URLs resolve to absolute ones.
  metadataBase: new URL(env.APP_URL),
  title: "DealFlow",
  description: "Workflow sales-to-cash untuk tim B2B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, hence the warning opt-out.
    <html lang="id" className={`${geist.variable} ${geistMono.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <body className="font-sans">
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {children}
      </body>
    </html>
  );
}
