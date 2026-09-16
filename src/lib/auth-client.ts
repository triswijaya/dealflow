import { createAuthClient } from "better-auth/react";

// No baseURL override: the client and API route share the same origin, so
// requests to /api/auth/* resolve relative to wherever the app is served.
// This file must never import from src/server/* (ARCH-04: no secrets in the
// client bundle).
export const authClient = createAuthClient();
