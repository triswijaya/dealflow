import type { NextConfig } from "next";
import { securityHeaders } from "./src/server/security/headers";

// Fails fast at startup/build if the environment is misconfigured (§18.2).
import "./src/server/env";

const isDev = process.env.NODE_ENV === "development";
// HTTPS is guaranteed on every hosted environment; local and test runs use plain http.
const hosted = ["production", "preview", "demo"].includes(process.env.APP_ENV ?? "");

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders({ isDev, hosted }) }];
  },
};

export default nextConfig;
