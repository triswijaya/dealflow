import Link from "next/link";

/** The refined prototype's mark: an ink tile carrying three bars of falling height. */
export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 32 32">
        <rect width="32" height="32" rx="9" fill="currentColor" />
        <g fill="var(--on-ink)">
          <rect x="7.5" y="8" width="4.5" height="12" rx="1.6" />
          <rect x="13.75" y="8" width="4.5" height="16" rx="1.6" opacity=".75" />
          <rect x="20" y="8" width="4.5" height="8" rx="1.6" opacity=".5" />
        </g>
      </svg>
    </span>
  );
}

/** App mark and name; the optional subtitle names the workspace under it. */
export function Brand({ href = "/", subtitle }: { href?: string; subtitle?: string }) {
  return (
    <Link className="brand" href={href} aria-label="DealFlow">
      <BrandMark />
      <span className="brand-text">
        <span>dealflow</span>
        {subtitle ? <small>{subtitle}</small> : null}
      </span>
    </Link>
  );
}
