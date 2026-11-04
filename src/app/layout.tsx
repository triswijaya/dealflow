import type { Metadata } from "next";
import { Geist, Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { env } from "@/server/env";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// The app reads Geist for text and Geist Mono for figures (the refined prototype).
// Jakarta stays loaded only because the marketing page still sets its UI text in it.
const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  // Makes relative Open Graph and icon URLs resolve to absolute ones.
  metadataBase: new URL(env.APP_URL),
  title: "DealFlow",
  description: "Workflow sales-to-cash untuk tim B2B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The theme script sets data-theme before hydration, hence the warning opt-out.
    <html lang="id" className={`${geist.variable} ${geistMono.variable} ${jakarta.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
