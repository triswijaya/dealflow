import type { Metadata } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { LandingPage } from "./landing-page";
import "./landing.css";

// Display face for headlines (drawn for Jakarta's city identity), and a mono for
// the document numbers and WIB timestamps that run through the product.
const display = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

const title = "DealFlow · Dari peluang menjadi pembayaran";
const description =
  "Kelola customer, pipeline deal, quotation, follow-up, invoice, dan pembayaran dalam satu alur. DealFlow untuk tim penjualan bisnis B2B Indonesia.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    title,
    description: "Ruang kerja penjualan untuk bisnis B2B. Dari customer pertama sampai pembayaran terakhir.",
  },
};

export const viewport = { themeColor: "#FFFFFF" };

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }
  return (
    <div className={`${display.variable} ${mono.variable}`}>
      <LandingPage />
    </div>
  );
}
