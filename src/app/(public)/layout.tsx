// Screens reachable whether or not someone is signed in (an emailed link opens
// in whatever browser the person happens to have). Each page picks its own
// AuthShell variant, so this layout only exists to share the route group.
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return children;
}
