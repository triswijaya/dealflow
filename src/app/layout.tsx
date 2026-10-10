import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { env } from "@/server/env";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

export const metadata: Metadata = {
  // Makes relative Open Graph and icon URLs resolve to absolute ones.
  metadataBase: new URL(env.APP_URL),
  title: "DealFlow",
  description: "Workflow sales-to-cash untuk tim B2B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
