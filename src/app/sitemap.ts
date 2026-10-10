import type { MetadataRoute } from "next";
import { env } from "@/server/env";

// Only the pages a stranger can open: the landing page and the two entry screens.
export const PUBLIC_PATHS = ["/", "/login", "/register"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: `${env.APP_URL}${path === "/" ? "" : path}`,
    changeFrequency: path === "/" ? "weekly" : "yearly",
    priority: path === "/" ? 1 : 0.4,
  }));
}
