import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { ac, roles } from "./auth-permissions";

// No baseURL override: the client and API route share the same origin, so
// requests to /api/auth/* resolve relative to wherever the app is served.
// This file must never import from src/server/* (ARCH-04: no secrets in the
// client bundle); auth-permissions.ts has none, safe to share.
export const authClient = createAuthClient({
  plugins: [organizationClient({ ac, roles })],
});
