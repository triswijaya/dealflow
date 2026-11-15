import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth/auth";
import { FAQ } from "./content";
import { LandingPage } from "./landing-page";
import "./landing.css";

const title = "DealFlow · Dari peluang menjadi pembayaran";
const description =
  "Kelola customer, pipeline deal, penawaran, pesanan bertermin, invoice, dan pembayaran dalam satu alur. DealFlow untuk tim sales dan finance bisnis B2B Indonesia.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    type: "website",
    title,
    description: "Ruang kerja penjualan untuk bisnis B2B. Dari chat pertama sampai uang masuk.",
  },
};

// The hero is dark, so the browser chrome on phones matches it.
export const viewport = { themeColor: "#181818" };

// FAQ structured data, from the same list the page shows (AEO).
const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map((item) => ({ "@type": "Question", name: item.q, acceptedAnswer: { "@type": "Answer", text: item.a } })),
};

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    redirect("/dashboard");
  }
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema).replace(/</g, "\\u003c") }} />
      <LandingPage />
    </>
  );
}
