import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { LandingPage } from "./landing-page";
import "./landing.css";

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

export const viewport = { themeColor: "#F7F6F5" };

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }
  return <LandingPage />;
}
