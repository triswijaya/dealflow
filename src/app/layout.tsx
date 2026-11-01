import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { env } from "@/server/env";
import "./globals.css";

// One family for text and numbers; tabular-nums keeps figures aligned.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta" });

export const metadata: Metadata = {
  // Makes relative Open Graph and icon URLs resolve to absolute ones.
  metadataBase: new URL(env.APP_URL),
  title: "DealFlow",
  description: "Workflow sales-to-cash untuk tim B2B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={jakarta.variable} data-scroll-behavior="smooth">
      <body className="font-sans">{children}</body>
    </html>
  );
}
