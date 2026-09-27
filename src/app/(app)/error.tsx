"use client";

import { ErrorContent } from "@/components/system-pages";

// API-03: an unexpected failure shows a generic message plus a reference the
// user can quote; the stack trace never reaches the browser.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorContent reference={error.digest} onRetry={reset} />;
}
