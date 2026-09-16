import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DealFlow",
  description: "Sales-to-cash workflow for B2B teams.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
