import { Hanken_Grotesk } from "next/font/google";

// Marketing face: the closest free match to the reference's grotesque (slanted-cut t, plain zeros).
// Product mock-ups keep Inter, which the root layout already loads.
export const hanken = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-hanken", display: "swap" });
