import Link from "next/link";

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="3" y="4" width="5" height="16" rx="1" />
        <rect x="10" y="4" width="5" height="11" rx="1" />
        <rect x="17" y="4" width="4" height="7" rx="1" />
      </svg>
    </span>
  );
}

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link className="brand" href={href} aria-label="DealFlow">
      <BrandMark />
      <span>dealflow</span>
    </Link>
  );
}
