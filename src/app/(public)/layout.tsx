// Screens reachable whether or not someone is signed in (an emailed link opens
// in whatever browser the person happens to have). Each page picks its own
// AuthShell variant, so this layout only exists to share the route group.
import type { Metadata } from "next";

// One-time emailed links (verify, reset, invitation) must never be indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return children;
}
