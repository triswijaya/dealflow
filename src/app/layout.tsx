import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: "DealFlow",
  description: "Workflow sales-to-cash untuk tim B2B.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={cn("font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  );
}
