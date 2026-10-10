import type { MetadataRoute } from "next";
import { env } from "@/server/env";

// Public pages may be indexed; everything behind a sign-in, and every emailed
// one-time link, may not.
export const PRIVATE_PATHS = [
  "/dashboard",
  "/pipeline",
  "/deals",
  "/customers",
  "/quotations",
  "/invoices",
  "/follow-ups",
  "/search",
  "/settings",
  "/onboarding",
  "/accept-invitation",
  "/reset-password",
  "/verify-email",
  "/api/",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: PRIVATE_PATHS }],
    sitemap: `${env.APP_URL}/sitemap.xml`,
  };
}
